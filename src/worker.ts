import { DurableObject } from 'cloudflare:workers';
import { HttpError } from './http';
import { answerKey, cleanQuiz, judge, parseAnswer, showAnswer } from './quiz';
import { starterQuizzes } from './quizzes';
import {
	ACTIVE,
	defaultState,
	MENU_REVISION,
	refreshMenu,
	refreshPerkNames,
	TX_KINDS,
	type FeedItem,
	type LogGroup,
	type MenuItem,
	type Order,
	type OrderStatus,
	type Perk,
	type QuickAction,
	type QuizGame,
	type QuizView,
	type Settings,
	type Snapshot,
	type State,
	type Tx,
	type TxKind,
} from './shared';

interface Env {
	PARTY: DurableObjectNamespace<Party>;
	ASSETS: Fetcher;
	STAFF_PIN?: string;
}

const TZ = 'Europe/Lisbon';
const HOUR = 3_600_000;
const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' });
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const lisbonHour = (ts: number) => Number(hourFmt.format(ts)) % 24;

/** Lisbon is always a whole-hour offset from UTC, so UTC hour boundaries are Lisbon hour boundaries. */
function nextPaydayAt(now: number, hours: number[]): number | null {
	if (!hours.length) return null;
	let t = Math.floor(now / HOUR) * HOUR + HOUR;
	for (let i = 0; i < 48; i++, t += HOUR) if (hours.includes(lisbonHour(t))) return t;
	return null;
}

const uid = () => crypto.randomUUID().replaceAll('-', '').slice(0, 12);
const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function hashPin(pid: string, pin: string): Promise<string> {
	const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${pid}:${pin}`));
	return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function int(v: unknown, label: string, min: number, max: number): number {
	const n = typeof v === 'string' ? Number(v) : v;
	if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max)
		throw new HttpError(`${label} must be a whole number between ${min} and ${max}`);
	return n;
}

function str(v: unknown, label: string, max: number, allowEmpty = false): string {
	const s = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
	if (!allowEmpty && !s) throw new HttpError(`${label} is required`);
	if (s.length > max) throw new HttpError(`${label} is too long (max ${max})`);
	return s;
}

function cleanName(v: unknown): string {
	return str(v, 'Name', 24);
}

function cleanPin(v: unknown): string {
	if (typeof v !== 'string' || !/^\d{4}$/.test(v)) throw new HttpError('PIN must be 4 digits');
	return v;
}

type Who = { role: 'guest'; pid: string } | { role: 'staff' } | { role: 'public' };
type Body = Record<string, unknown> & { type?: string };

export class Party extends DurableObject<Env> {
	private s!: State;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
		ctx.blockConcurrencyWhile(async () => {
			const stored = await ctx.storage.get<State>('state');
			this.s = { ...defaultState(), ...stored };
			if (!stored?.quizzes) this.s.quizzes = starterQuizzes();
			if (stored) {
				const revision = stored.menuRevision ?? 0;
				const olderMenu = revision < MENU_REVISION;
				const perks = refreshPerkNames(this.s.perks);
				const renamedPerks = perks.some((perk, index) => perk !== this.s.perks[index]);
				if (olderMenu) {
					this.s.menu = refreshMenu(this.s.menu, revision);
					this.s.menuRevision = MENU_REVISION;
				}
				this.s.perks = perks;
				if (olderMenu || renamedPerks) await ctx.storage.put('state', this.s);
			}
			if ((await ctx.storage.getAlarm()) == null) await this.schedule();
		});
	}

	// ---------- transport ----------

	override async fetch(req: Request): Promise<Response> {
		const url = new URL(req.url);
		if (url.pathname === '/ws') {
			if (req.headers.get('Upgrade') !== 'websocket') return new Response('Expected websocket', { status: 426 });
			const { 0: client, 1: server } = new WebSocketPair();
			const token = url.searchParams.get('token') ?? '';
			this.ctx.acceptWebSocket(server);
			server.serializeAttachment({ token });
			server.send(JSON.stringify(this.snapshot(token)));
			return new Response(null, { status: 101, webSocket: client });
		}
		if (req.method !== 'POST') return json({ error: 'Not found' }, 404);
		try {
			const body = ((await req.json().catch(() => ({}))) ?? {}) as Body;
			const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
			switch (url.pathname) {
				case '/api/join':
					return json(await this.join(body));
				case '/api/login':
					return json(await this.login(body));
				case '/api/staff-login':
					return json(await this.staffLogin(body));
				case '/api/act':
					return json((await this.act(token, body)) ?? { ok: true });
				default:
					throw new HttpError('Not found', 404);
			}
		} catch (e) {
			if (e instanceof HttpError) return json({ error: e.message }, e.status);
			console.error(e);
			return json({ error: 'Server error' }, 500);
		}
	}

	override async webSocketMessage(): Promise<void> {}

	override async webSocketClose(ws: WebSocket, code: number): Promise<void> {
		try {
			ws.close(code === 1005 ? 1000 : code);
		} catch {}
	}

	private broadcast(): void {
		for (const ws of this.ctx.getWebSockets()) {
			const { token } = (ws.deserializeAttachment() ?? { token: '' }) as { token: string };
			try {
				ws.send(JSON.stringify(this.snapshot(token)));
			} catch {}
		}
	}

	private async commit(): Promise<void> {
		await this.ctx.storage.put('state', this.s);
		this.broadcast();
	}

	// ---------- auth ----------

	private who(token: string): Who {
		if (!token) return { role: 'public' };
		if (this.s.staffTokens.includes(token)) return { role: 'staff' };
		const pid = this.s.tokens[token];
		if (pid && this.s.players[pid] && !this.s.players[pid].removed) return { role: 'guest', pid };
		return { role: 'public' };
	}

	private findByName(name: string) {
		const key = name.toLocaleLowerCase('pt');
		return Object.values(this.s.players).find(p => !p.removed && p.name.toLocaleLowerCase('pt') === key);
	}

	private async join(body: Body) {
		const name = cleanName(body.name);
		const pin = cleanPin(body.pin);
		const id = uid();
		const pinHash = await hashPin(id, pin);
		const pid = this.createPlayer(id, name, pinHash);
		const token = crypto.randomUUID();
		this.s.tokens[token] = pid;
		await this.commit();
		return { token };
	}

	private createPlayer(id: string, name: string, pinHash: string): string {
		if (this.findByName(name)) throw new HttpError(`"${name}" is taken. Log in or use another name.`);
		this.s.players[id] = { id, name, pinHash, joinedAt: Date.now() };
		this.addTx([{ pid: id, amt: this.s.settings.startBalance }], 'start', 'Welcome money');
		this.feed(`${name} joined`, 'info');
		return id;
	}

	private async login(body: Body) {
		const name = cleanName(body.name);
		const pin = cleanPin(body.pin);
		const p = this.findByName(name);
		if (!p || (await hashPin(p.id, pin)) !== p.pinHash) throw new HttpError('Wrong name or PIN', 401);
		const token = crypto.randomUUID();
		this.s.tokens[token] = p.id;
		await this.commit();
		return { token };
	}

	private async staffLogin(body: Body) {
		const expected = this.env.STAFF_PIN;
		if (!expected) throw new HttpError('Staff sign-in is unavailable', 500);
		if (typeof body.pin !== 'string' || body.pin !== expected) throw new HttpError('Wrong staff PIN', 401);
		const token = crypto.randomUUID();
		this.s.staffTokens.push(token);
		await this.ctx.storage.put('state', this.s);
		return { token };
	}

	// ---------- ledger ----------

	private balances() {
		const bal = new Map<string, number>();
		const earned = new Map<string, number>();
		for (const t of this.s.tx) {
			if (t.undone) continue;
			bal.set(t.pid, (bal.get(t.pid) ?? 0) + t.amt);
			if (t.kind === 'prize') earned.set(t.pid, (earned.get(t.pid) ?? 0) + t.amt);
		}
		return { bal, earned };
	}

	private balance(pid: string): number {
		let b = 0;
		for (const t of this.s.tx) if (t.pid === pid && !t.undone) b += t.amt;
		return b;
	}

	private addTx(entries: { pid: string; amt: number }[], kind: TxKind, reason: string): Tx[] {
		const group = uid();
		const ts = Date.now();
		const txs = entries.map(e => ({ id: uid(), group, ts, pid: e.pid, amt: e.amt, kind, reason }));
		this.s.tx.push(...txs);
		return txs;
	}

	private feed(text: string, kind: FeedItem['kind']): void {
		this.s.feed.push({ id: uid(), ts: Date.now(), text, kind });
		if (this.s.feed.length > 200) this.s.feed.splice(0, this.s.feed.length - 200);
	}

	private requireFunds(pid: string, amount: number): void {
		const b = this.balance(pid);
		if (b < amount) throw new HttpError(`${this.s.players[pid]?.name ?? 'Player'} only has ${b} Ê$`);
	}

	private activePlayers() {
		return Object.values(this.s.players).filter(p => !p.removed);
	}

	private player(pid: unknown) {
		const p = typeof pid === 'string' ? this.s.players[pid] : undefined;
		if (!p || p.removed) throw new HttpError('Unknown player');
		return p;
	}

	private item(id: unknown): MenuItem {
		const it = this.s.menu.find(m => m.id === id);
		if (!it) throw new HttpError('Unknown menu item');
		return it;
	}

	private order(id: unknown): Order {
		const o = this.s.orders.find(x => x.id === id);
		if (!o) throw new HttpError('Unknown order');
		return o;
	}

	private payday(): void {
		const amt = this.s.settings.paydayAmount;
		const players = this.activePlayers();
		if (!players.length || amt <= 0) return;
		this.addTx(
			players.map(p => ({ pid: p.id, amt })),
			'payday',
			'Payday',
		);
		this.feed(`Payday · +${amt} Ê$ each`, 'payday');
	}

	private takeStock(item: MenuItem, qty: number): void {
		if (!item.available || item.archived) throw new HttpError(`${item.name} is unavailable`);
		if (item.stock != null) {
			if (item.stock < qty) throw new HttpError(item.stock === 0 ? `${item.name} is sold out` : `Only ${item.stock} ${item.name} left`);
			item.stock -= qty;
		}
	}

	private refundOrder(o: Order): void {
		const tx = this.s.tx.find(t => t.id === o.txId);
		if (tx) tx.undone = true;
		const item = this.s.menu.find(m => m.id === o.itemId);
		if (item && item.stock != null) item.stock += 1;
	}

	private placeOrder(pid: string, body: Body, initial: OrderStatus): Order {
		const item = this.item(body.itemId);
		if (item.serve !== 'bar') throw new HttpError(`${item.name} is self-serve`);
		this.requireFunds(pid, item.price);
		const note = str(body.note, 'Note', 120, true);
		this.takeStock(item, 1);
		const virgin = item.mocktail === true;
		const [tx] = this.addTx([{ pid, amt: -item.price }], 'order', item.name);
		const now = Date.now();
		const o: Order = {
			id: uid(),
			ts: now,
			updatedAt: now,
			pid,
			itemId: item.id,
			itemName: item.name,
			price: item.price,
			virgin,
			note,
			status: initial,
			txId: tx!.id,
			priority: false,
		};
		this.s.orders.push(o);
		return o;
	}

	// ---------- actions ----------

	private async act(token: string, body: Body): Promise<unknown> {
		const who = this.who(token);
		if (who.role === 'public') throw new HttpError('Not logged in', 401);
		const type = body.type;
		if (who.role === 'guest') {
			const pid = who.pid;
			const me = this.s.players[pid]!;
			switch (type) {
				case 'order': {
					if (!this.s.settings.barOpen) throw new HttpError('Bar closed');
					const active = this.s.orders.filter(o => o.pid === pid && ACTIVE.includes(o.status)).length;
					if (active >= this.s.settings.maxActiveOrders)
						throw new HttpError(`You already have ${active} drinks in the queue`);
					this.placeOrder(pid, body, 'queued');
					break;
				}
				case 'cancelOrder': {
					const o = this.order(body.orderId);
					if (o.pid !== pid) throw new HttpError('Not your order', 403);
					if (o.status !== 'queued') throw new HttpError('Only queued orders can be cancelled');
					o.status = 'cancelled';
					o.updatedAt = Date.now();
					this.refundOrder(o);
					break;
				}
				case 'buy': {
					const item = this.item(body.itemId);
					if (item.serve !== 'self') throw new HttpError(`${item.name} is ordered at the bar`);
					const qty = int(body.qty ?? 1, 'Quantity', 1, 20);
					this.requireFunds(pid, item.price * qty);
					this.takeStock(item, qty);
					this.addTx([{ pid, amt: -item.price * qty }], 'purchase', `${qty > 1 ? `${qty}× ` : ''}${item.name}`);
					break;
				}
				case 'buyPerk': {
					const perk = this.s.perks.find(p => p.id === body.perkId);
					if (!perk) throw new HttpError('Unknown perk');
					const target = perk.needsTarget ? this.player(body.target) : null;
					if (target?.id === pid) throw new HttpError('Select another guest');
					this.requireFunds(pid, perk.price);
					if (perk.effect === 'skipQueue') {
						const mine = this.s.orders.find(o => o.pid === pid && o.status === 'queued' && !o.priority);
						if (!mine) throw new HttpError('A queued drink order is required');
						mine.priority = true;
						mine.updatedAt = Date.now();
					}
					this.addTx([{ pid, amt: -perk.price }], 'perk', target ? `${perk.name} → ${target.name}` : perk.name);
					this.feed(`${me.name}: ${perk.name}${target ? ` → ${target.name}` : ''}`, 'perk');
					break;
				}
				case 'transfer': {
					const to = this.player(body.to);
					if (to.id === pid) throw new HttpError("You can't send coins to yourself");
					const amount = int(body.amount, 'Amount', 1, 100_000);
					const note = str(body.note, 'Note', 60, true);
					this.requireFunds(pid, amount);
					const reason = note ? `${me.name} → ${to.name}: ${note}` : `${me.name} → ${to.name}`;
					this.addTx(
						[
							{ pid, amt: -amount },
							{ pid: to.id, amt: amount },
						],
						'transfer',
						reason,
					);
					this.feed(`${me.name} sent ${to.name} ${amount} Ê$${note ? ` · “${note}”` : ''}`, 'transfer');
					break;
				}
				case 'quizAnswer': {
					const g = this.liveGame();
					const q = g.quiz.questions[g.index];
					if (g.phase !== 'question' || !q) throw new HttpError('No question is open');
					if (Date.now() > g.endsAt) throw new HttpError('Time’s up');
					if (g.answers[pid]) throw new HttpError('You already answered');
					g.answers[pid] = { v: parseAnswer(q, body.answer), ts: Date.now() };
					if (this.activePlayers().every(p => g.answers[p.id])) this.reveal(g);
					break;
				}
				default:
					throw new HttpError('Unknown action');
			}
			await this.commit();
			if (type === 'quizAnswer') await this.schedule();
			return;
		}

		// staff
		switch (type) {
			case 'orderStatus': {
				const o = this.order(body.orderId);
				const status = body.status as OrderStatus;
				if (!['making', 'ready', 'done', 'cancelled'].includes(status)) throw new HttpError('Bad status');
				if (!ACTIVE.includes(o.status)) throw new HttpError('Order is already closed');
				o.status = status;
				o.updatedAt = Date.now();
				if (status === 'cancelled') this.refundOrder(o);
				if (status === 'ready')
					this.feed(`${o.itemName} ready for ${this.s.players[o.pid]?.name ?? 'guest'}`, 'ready');
				break;
			}
			case 'chargeOrder': {
				this.placeOrder(this.player(body.pid).id, body, 'making');
				break;
			}
			case 'chargeItem': {
				const p = this.player(body.pid);
				const item = this.item(body.itemId);
				const qty = int(body.qty ?? 1, 'Quantity', 1, 20);
				this.requireFunds(p.id, item.price * qty);
				this.takeStock(item, qty);
				this.addTx([{ pid: p.id, amt: -item.price * qty }], 'purchase', `${qty > 1 ? `${qty}× ` : ''}${item.name}`);
				break;
			}
			case 'setBarOpen': {
				this.s.settings.barOpen = body.open === true;
				this.feed(this.s.settings.barOpen ? 'Bar open' : 'Bar closed', 'info');
				break;
			}
			case 'grant': {
				const pids = Array.isArray(body.pids) ? body.pids : [];
				if (!pids.length) throw new HttpError('Select at least one player');
				const players = [...new Set(pids)].map(id => this.player(id));
				const amount = int(body.amount, 'Amount', -100_000, 100_000);
				if (amount === 0) throw new HttpError('Amount cannot be 0');
				const reason = str(body.reason, 'Reason', 60);
				const kind = body.kind as TxKind;
				if (!TX_KINDS.includes(kind)) throw new HttpError('Bad kind');
				if (amount < 0) {
					const broke = players.filter(p => this.balance(p.id) < -amount);
					if (broke.length) throw new HttpError(`Not enough coins: ${broke.map(p => p.name).join(', ')}`);
				}
				this.addTx(
					players.map(p => ({ pid: p.id, amt: amount })),
					kind,
					reason,
				);
				if (kind === 'prize' || kind === 'contribution') {
					this.feed(`${players.map(p => p.name).join(', ')} +${amount} Ê$ · ${reason}`, 'prize');
				}
				break;
			}
			case 'payday': {
				if (!this.activePlayers().length) throw new HttpError('No players yet');
				this.payday();
				break;
			}
			case 'undo': {
				const txs = this.s.tx.filter(t => t.group === body.group);
				if (!txs.length) throw new HttpError('Unknown entry');
				if (txs.some(t => t.kind === 'order')) throw new HttpError('Cancel the order from the bar instead');
				const undone = !txs[0]!.undone;
				for (const t of txs) t.undone = undone;
				break;
			}
			case 'settings': {
				const v = (body.settings ?? {}) as Partial<Settings>;
				const s = this.s.settings;
				const hours = Array.isArray(v.paydayHours) ? v.paydayHours : s.paydayHours;
				this.s.settings = {
					...s,
					startBalance: int(v.startBalance ?? s.startBalance, 'Start balance', 0, 10_000),
					paydayAmount: int(v.paydayAmount ?? s.paydayAmount, 'Payday amount', 0, 10_000),
					paydayHours: [...new Set(hours.map(h => int(h, 'Payday hour', 0, 23)))],
					autoPayday: typeof v.autoPayday === 'boolean' ? v.autoPayday : s.autoPayday,
					maxActiveOrders: int(v.maxActiveOrders ?? s.maxActiveOrders, 'Max drinks in queue', 1, 10),
				};
				await this.schedule();
				break;
			}
			case 'adjustStock': {
				const item = this.item(body.itemId);
				const delta = int(body.delta, 'Stock adjustment', -1, 1);
				item.stock = Math.min(10_000, Math.max(0, (item.stock ?? 0) + delta));
				break;
			}
			case 'setItemAvailability': {
				this.item(body.itemId).available = body.available === true;
				break;
			}
			case 'saveItem': {
				const v = (body.item ?? {}) as Partial<MenuItem>;
				const existing = v.id ? this.s.menu.find(m => m.id === v.id) : undefined;
				const stock = v.stock === null || v.stock === undefined || (v.stock as unknown) === '' ? null : int(v.stock, 'Stock', 0, 10_000);
				const next: MenuItem = {
					id: existing?.id ?? uid(),
					name: str(v.name, 'Name', 40),
					desc: str(v.desc, 'Description', 120, true),
					section: str(v.section, 'Section', 30),
					price: int(v.price, 'Price', 0, 10_000),
					serve: v.serve === 'self' ? 'self' : 'bar',
					img: existing?.img ?? '',
					mocktail: v.serve !== 'self' && (v.mocktail ?? existing?.mocktail) === true,
					available: v.available !== false,
					stock,
				};
				if (existing) Object.assign(existing, next);
				else this.s.menu.push(next);
				break;
			}
			case 'deleteItem': {
				const it = this.item(body.itemId);
				if (this.s.orders.some(o => o.itemId === it.id && ACTIVE.includes(o.status)))
					throw new HttpError('That item has open orders');
				this.s.menu = this.s.menu.filter(m => m.id !== it.id);
				break;
			}
			case 'setPerks': {
				const list = Array.isArray(body.perks) ? (body.perks as Partial<Perk>[]) : [];
				this.s.perks = list.map(p => ({
					id: typeof p.id === 'string' && p.id ? p.id : uid(),
					name: str(p.name, 'Perk name', 60),
					price: int(p.price, 'Perk price', 0, 10_000),
					needsTarget: p.needsTarget === true,
					effect: p.effect === 'skipQueue' ? 'skipQueue' : 'none',
				}));
				break;
			}
			case 'setActions': {
				const list = Array.isArray(body.actions) ? (body.actions as Partial<QuickAction>[]) : [];
				this.s.actions = list.map(a => {
					if (!TX_KINDS.includes(a.kind as TxKind)) throw new HttpError('Bad kind');
					const amount = int(a.amount, 'Amount', -100_000, 100_000);
					if (amount === 0) throw new HttpError('Amount cannot be 0');
					return {
						id: typeof a.id === 'string' && a.id ? a.id : uid(),
						label: str(a.label, 'Label', 40),
						amount,
						kind: a.kind as TxKind,
					};
				});
				break;
			}
			case 'addPlayer': {
				const name = cleanName(body.name);
				const pin = cleanPin(body.pin);
				const id = uid();
				this.createPlayer(id, name, await hashPin(id, pin));
				break;
			}
			case 'resetPin': {
				const p = this.player(body.pid);
				p.pinHash = await hashPin(p.id, cleanPin(body.pin));
				break;
			}
			case 'renamePlayer': {
				const p = this.player(body.pid);
				const name = cleanName(body.name);
				const clash = this.findByName(name);
				if (clash && clash.id !== p.id) throw new HttpError(`"${name}" is taken`);
				p.name = name;
				break;
			}
			case 'removePlayer': {
				const p = this.player(body.pid);
				for (const o of this.s.orders)
					if (o.pid === p.id && ACTIVE.includes(o.status)) {
						o.status = 'cancelled';
						o.updatedAt = Date.now();
						this.refundOrder(o);
					}
				p.removed = true;
				for (const [t, pid] of Object.entries(this.s.tokens)) if (pid === p.id) delete this.s.tokens[t];
				break;
			}
			case 'reset': {
				if (body.confirm !== 'RESET') throw new HttpError('Type RESET to confirm');
				const fresh = defaultState();
				this.s = {
					...fresh,
					menu: this.s.menu,
					perks: this.s.perks,
					actions: this.s.actions,
					settings: this.s.settings,
					staffTokens: this.s.staffTokens,
					quizzes: this.s.quizzes,
				};
				for (const m of this.s.menu) if (!m.archived) m.available = true;
				break;
			}
			case 'restoreMenu': {
				this.s.menu = defaultState().menu;
				break;
			}
			case 'saveQuiz': {
				const quiz = cleanQuiz(body.quiz, uid);
				const i = this.s.quizzes.findIndex(q => q.id === quiz.id);
				if (i >= 0) this.s.quizzes[i] = quiz;
				else this.s.quizzes.push(quiz);
				break;
			}
			case 'importQuizzes': {
				const quizzes = (Array.isArray(body.quizzes) ? body.quizzes : [body.quizzes]).map(q => cleanQuiz(q, uid));
				const taken = new Set(this.s.quizzes.map(q => q.id));
				for (const quiz of quizzes) {
					if (taken.has(quiz.id)) quiz.id = uid();
					taken.add(quiz.id);
					this.s.quizzes.push(quiz);
				}
				break;
			}
			case 'deleteQuiz': {
				this.s.quizzes = this.s.quizzes.filter(q => q.id !== body.quizId);
				break;
			}
			case 'quizStart': {
				if (this.s.game && this.s.game.phase !== 'final') throw new HttpError('Another quiz is running. End it first.');
				const quiz = this.s.quizzes.find(q => q.id === body.quizId);
				if (!quiz) throw new HttpError('Unknown quiz');
				this.s.game = {
					quiz: structuredClone(quiz),
					phase: 'lobby',
					index: -1,
					endsAt: 0,
					answers: {},
					marks: {},
					txGroup: '',
					scores: {},
					playCount: 0,
				};
				break;
			}
			case 'quizNext': {
				const g = this.liveGame();
				if (g.phase === 'question') throw new HttpError('Reveal the answer first');
				if (g.phase === 'final') throw new HttpError('The quiz is over');
				this.advance(g);
				break;
			}
			case 'quizSkip': {
				const g = this.liveGame();
				if (g.phase !== 'question') throw new HttpError('No question is open');
				this.advance(g);
				break;
			}
			case 'quizReveal': {
				const g = this.liveGame();
				if (g.phase !== 'question') throw new HttpError('No question is open');
				this.reveal(g);
				break;
			}
			case 'quizExtend': {
				const g = this.liveGame();
				if (g.phase !== 'question') throw new HttpError('No question is open');
				g.endsAt = Math.max(g.endsAt, Date.now()) + int(body.seconds ?? 10, 'Seconds', 1, 120) * 1000;
				break;
			}
			case 'quizReplay': {
				this.liveGame().playCount++;
				break;
			}
			case 'quizMark': {
				const g = this.liveGame();
				if (g.phase !== 'reveal') throw new HttpError('Marks can only change during the reveal');
				this.mark(g, this.player(body.pid).id, body.correct === true);
				break;
			}
			case 'quizEnd': {
				this.finish(this.liveGame());
				break;
			}
			case 'quizClose': {
				this.s.game = null;
				break;
			}
			default:
				throw new HttpError('Unknown action');
		}
		await this.commit();
		if (typeof type === 'string' && type.startsWith('quiz')) await this.schedule();
	}

	// ---------- quiz ----------

	private liveGame(): QuizGame {
		if (!this.s.game) throw new HttpError('No quiz is running');
		return this.s.game;
	}

	/** Opens the next question, or ends the quiz after the last one. */
	private advance(g: QuizGame): void {
		const q = g.quiz.questions[g.index + 1];
		if (!q) return this.finish(g);
		g.index++;
		g.phase = 'question';
		g.answers = {};
		g.marks = {};
		g.txGroup = '';
		g.endsAt = Date.now() + q.seconds * 1000;
	}

	private reveal(g: QuizGame): void {
		const q = g.quiz.questions[g.index];
		if (g.phase !== 'question' || !q) return;
		g.phase = 'reveal';
		g.endsAt = Date.now();
		g.txGroup = uid();
		g.marks = {};
		for (const [pid, right] of Object.entries(judge(q, g.answers)))
			if (this.s.players[pid] && !this.s.players[pid].removed) this.mark(g, pid, right);
	}

	/** Sets a player's mark for the revealed question and pays or claws back its prize. */
	private mark(g: QuizGame, pid: string, right: boolean): void {
		const was = g.marks[pid] === true;
		g.marks[pid] = right;
		if (was === right) return;
		g.scores[pid] = (g.scores[pid] ?? 0) + (right ? 1 : -1);
		if (!g.quiz.reward) return;
		if (right)
			this.s.tx.push({
				id: uid(),
				group: g.txGroup,
				ts: Date.now(),
				pid,
				amt: g.quiz.reward,
				kind: 'prize',
				reason: `Quiz · ${g.quiz.title} Q${g.index + 1}`,
			});
		else this.s.tx = this.s.tx.filter(t => !(t.group === g.txGroup && t.pid === pid));
	}

	private finish(g: QuizGame): void {
		if (g.phase === 'final') return;
		g.phase = 'final';
		g.answers = {};
		const board = this.quizBoard(g);
		const top = board[0];
		if (top) {
			const winners = board.filter(r => r.correct === top.correct).map(r => r.name);
			this.feed(`${g.quiz.title} quiz won by ${winners.join(' & ')} · ${top.correct} right`, 'info');
		}
	}

	private quizBoard(g: QuizGame) {
		return Object.entries(g.scores)
			.filter(([pid, n]) => n > 0 && this.s.players[pid] && !this.s.players[pid].removed)
			.map(([pid, n]) => ({ name: this.s.players[pid]!.name, correct: n, won: n * g.quiz.reward }))
			.sort((a, b) => b.correct - a.correct || a.name.localeCompare(b.name));
	}

	private quizView(who: Who): QuizView | null {
		const g = this.s.game;
		if (!g) return null;
		const q = g.quiz.questions[g.index];
		const live = q && (g.phase === 'question' || g.phase === 'reveal') ? q : null;
		const view: QuizView = {
			title: g.quiz.title,
			category: g.quiz.category,
			reward: g.quiz.reward,
			phase: g.phase,
			index: g.index,
			total: g.quiz.questions.length,
			endsAt: g.endsAt,
			playCount: g.playCount,
			question: live && { id: live.id, kind: live.kind, prompt: live.prompt, options: live.options, media: live.media, seconds: live.seconds },
			answered: Object.keys(g.answers).length,
			players: this.activePlayers().length,
			board: this.quizBoard(g),
		};
		if (live && g.phase === 'reveal')
			view.reveal = {
				answer: answerKey(live),
				correct: live.kind === 'choice' ? live.correct : null,
				counts: live.options.map((_, i) => Object.values(g.answers).filter(a => a.v === i).length),
				winners: Object.keys(g.marks)
					.filter(pid => g.marks[pid] && this.s.players[pid])
					.map(pid => this.s.players[pid]!.name),
			};
		if (who.role === 'guest') {
			const a = g.answers[who.pid];
			view.mine = {
				answer: a && live ? showAnswer(live, a.v) : null,
				correct: g.phase === 'reveal' ? g.marks[who.pid] === true : undefined,
				score: g.scores[who.pid] ?? 0,
			};
		}
		return view;
	}

	private quizStaff() {
		const g = this.s.game;
		const q = g?.quiz.questions[g.index];
		if (!g || !q) return undefined;
		return {
			key: answerKey(q),
			answers: Object.entries(g.answers)
				.filter(([pid]) => this.s.players[pid] && !this.s.players[pid].removed)
				.sort((a, b) => a[1].ts - b[1].ts)
				.map(([pid, a]) => ({
					pid,
					name: this.s.players[pid]!.name,
					answer: showAnswer(q, a.v),
					correct: g.phase === 'reveal' ? g.marks[pid] === true : undefined,
				})),
		};
	}

	// ---------- paydays ----------

	private async schedule(): Promise<void> {
		const s = this.s.settings;
		const payday = s.autoPayday ? nextPaydayAt(Date.now(), s.paydayHours) : null;
		const timer = this.s.game?.phase === 'question' ? this.s.game.endsAt : null;
		const next = Math.min(payday ?? Infinity, timer ?? Infinity);
		if (next !== Infinity) await this.ctx.storage.setAlarm(next);
		else await this.ctx.storage.deleteAlarm();
	}

	override async alarm(): Promise<void> {
		const now = Date.now();
		const g = this.s.game;
		if (g?.phase === 'question' && now >= g.endsAt - 250) {
			this.reveal(g);
			await this.commit();
		}
		const hourStart = Math.floor(now / HOUR) * HOUR;
		const s = this.s.settings;
		if (s.autoPayday && now - hourStart < 10 * 60_000 && s.paydayHours.includes(lisbonHour(hourStart))) {
			const key = `${dayFmt.format(hourStart)}T${lisbonHour(hourStart)}`;
			if (this.s.lastPaydayKey !== key) {
				this.s.lastPaydayKey = key;
				this.payday();
				await this.commit();
			}
		}
		await this.schedule();
	}

	// ---------- snapshots ----------

	private snapshot(token: string): Snapshot {
		const who = this.who(token);
		const s = this.s;
		const { bal, earned } = this.balances();
		const name = (pid: string) => s.players[pid]?.name ?? '?';
		const active = s.orders
			.filter(o => ACTIVE.includes(o.status))
			.sort((a, b) => Number(b.priority) - Number(a.priority) || a.ts - b.ts);
		const base: Snapshot = {
			role: who.role,
			authError: token !== '' && who.role === 'public' ? true : undefined,
			now: Date.now(),
			players: this.activePlayers().map(p => ({
				id: p.id,
				name: p.name,
				balance: bal.get(p.id) ?? 0,
				earned: earned.get(p.id) ?? 0,
			})),
			menu: s.menu,
			perks: s.perks,
			settings: s.settings,
			feed: s.feed.slice(-40).reverse(),
			queue: active.map(o => ({
				id: o.id,
				pname: name(o.pid),
				itemName: o.itemName,
				virgin: o.virgin,
				priority: o.priority,
				status: o.status,
				ts: o.ts,
			})),
			nextPayday: s.settings.autoPayday ? nextPaydayAt(Date.now(), s.settings.paydayHours) : null,
			quiz: this.quizView(who),
		};
		if (who.role === 'guest') {
			const p = s.players[who.pid]!;
			return {
				...base,
				me: { id: p.id, name: p.name, balance: bal.get(p.id) ?? 0 },
				myOrders: s.orders.filter(o => o.pid === p.id).slice(-15).reverse(),
				myTx: s.tx.filter(t => t.pid === p.id).slice(-60).reverse(),
			};
		}
		if (who.role === 'staff') {
			const closed = s.orders.filter(o => !ACTIVE.includes(o.status)).slice(-40);
			return {
				...base,
				orders: [...active, ...closed].map(o => ({ ...o, pname: name(o.pid) })),
				actions: s.actions,
				log: this.log(),
				quizzes: s.quizzes,
				quizStaff: this.quizStaff(),
			};
		}
		return base;
	}

	private log(): LogGroup[] {
		const groups: LogGroup[] = [];
		const byId = new Map<string, LogGroup>();
		for (let i = this.s.tx.length - 1; i >= 0 && groups.length <= 200; i--) {
			const t = this.s.tx[i]!;
			let g = byId.get(t.group);
			if (!g) {
				g = { group: t.group, ts: t.ts, kind: t.kind, reason: t.reason, undone: !!t.undone, entries: [] };
				byId.set(t.group, g);
				groups.push(g);
			}
			g.entries.unshift({ pname: this.s.players[t.pid]?.name ?? '?', amt: t.amt });
		}
		return groups.slice(0, 200);
	}
}

export default {
	async fetch(req: Request, env: Env): Promise<Response> {
		const url = new URL(req.url);
		if (url.pathname === '/ws' || url.pathname.startsWith('/api/')) {
			return env.PARTY.get(env.PARTY.idFromName('party')).fetch(req);
		}
		return env.ASSETS.fetch(req);
	},
} satisfies ExportedHandler<Env>;
