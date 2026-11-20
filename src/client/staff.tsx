import { useEffect, useRef, useState } from 'preact/hooks';
import {
	ACTIVE,
	TX_KINDS,
	type LogGroup,
	type MenuItem,
	type Perk,
	type QuickAction,
	type Settings,
	type Snapshot,
	type StaffOrder,
	type TxKind,
} from '../shared';
import { ago, act, chime, clock, countdown, Illustration, Money, post, STAFF_KEY, Thumb, unlockAudio, useNow, useSnapshot, useStored, toast } from './lib';
import { Sheet } from './guest';

type Tab = 'Bar' | 'Bank' | 'Menu' | 'Perks' | 'Players' | 'Log' | 'Settings';
const TABS: Tab[] = ['Bar', 'Bank', 'Menu', 'Perks', 'Players', 'Log', 'Settings'];

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const num = (s: string) => (s.trim() === '' ? NaN : Number(s));

function groupBy<T>(list: T[], key: (t: T) => string): [string, T[]][] {
	const m = new Map<string, T[]>();
	for (const t of list) {
		const k = key(t);
		m.set(k, [...(m.get(k) ?? []), t]);
	}
	return [...m];
}

export function Staff() {
	const [token, setToken] = useStored(STAFF_KEY);
	const { snap, online } = useSnapshot(token);
	const [tab, setTab] = useState<Tab>('Bar');
	const [sound, setSound] = useState(false);
	const seen = useRef<Set<string> | null>(null);

	useEffect(() => {
		if (snap?.authError) setToken(null);
	}, [snap?.authError]);

	useEffect(() => {
		if (!snap?.orders) return;
		const ids = new Set(snap.orders.filter(o => o.status === 'queued').map(o => o.id));
		if (seen.current && sound) for (const id of ids) if (!seen.current.has(id)) { chime(2); break; }
		seen.current = new Set([...(seen.current ?? []), ...ids]);
	}, [snap?.orders, sound]);

	if (!token) return <Login onToken={setToken} />;
	if (!snap || snap.role !== 'staff')
		return (
			<div class="app staff">
				<p class="loading">Loading…</p>
			</div>
		);

	return (
		<div class="app staff">
			{!online && <div class="offline">Offline. Reconnecting…</div>}
			<header class="top">
				<div class="row">
					<div class="brand grow"><Illustration name="menu-pianist" /><h1>Bar Staff</h1></div>
					<span class={`st-dot ${online ? 'on' : ''}`} title={online ? 'Online' : 'Offline'} />
					<button class="ghost small" onClick={() => setToken(null)}>
						Log out
					</button>
				</div>
				<div class="row st-head">
					<button
						class={snap.settings.barOpen ? 'primary small' : 'danger small'}
						onClick={() => act(token, { type: 'setBarOpen', open: !snap.settings.barOpen })}
					>
						{snap.settings.barOpen ? 'Bar open' : 'Bar closed'}
					</button>
					<button
						class="ghost small"
						disabled={sound}
						onClick={() => {
							unlockAudio();
							chime(1);
							setSound(true);
						}}
					>
						{sound ? 'Sound on' : 'Enable sound'}
					</button>
				</div>
			</header>
			<nav class="tabs">
				{TABS.map(t => (
					<button key={t} class={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
						{t}
					</button>
				))}
			</nav>
			<main class="content">
				{tab === 'Bar' && <BarTab snap={snap} token={token} />}
				{tab === 'Bank' && <BankTab snap={snap} token={token} />}
				{tab === 'Menu' && <MenuTab snap={snap} token={token} />}
				{tab === 'Perks' && <PerksTab snap={snap} token={token} />}
				{tab === 'Players' && <PlayersTab snap={snap} token={token} />}
				{tab === 'Log' && <LogTab snap={snap} token={token} />}
				{tab === 'Settings' && <SettingsTab snap={snap} token={token} />}
			</main>
		</div>
	);
}

function Login({ onToken }: { onToken: (t: string) => void }) {
	const [pin, setPin] = useState('');
	const [busy, setBusy] = useState(false);
	const submit = async (e: Event) => {
		e.preventDefault();
		setBusy(true);
		try {
			const r = await post<{ token: string }>('/api/staff-login', { pin });
			onToken(r.token);
		} catch (err) {
			toast((err as Error).message, 'error');
		}
		setBusy(false);
	};
	return (
		<div class="app staff staff-entry">
			<form class="card st-login" onSubmit={submit}>
				<Illustration name="other-savouries" />
				<p class="eyebrow">Inês’s Cocktail Bar</p>
				<h1>Staff Entrance</h1>
				<input
					type="password"
					inputMode="numeric"
					placeholder="Staff PIN"
					autoComplete="off"
					value={pin}
					onInput={e => setPin(e.currentTarget.value)}
				/>
				<button class="primary" disabled={busy || !pin}>
					Enter
				</button>
			</form>
		</div>
	);
}

type P = { snap: Snapshot; token: string };

// ---------------- Bar ----------------

function BarTab({ snap, token }: P) {
	const now = useNow();
	const [charge, setCharge] = useState(false);
	const [showClosed, setShowClosed] = useState(false);
	const orders = snap.orders ?? [];
	const active = orders.filter(o => ACTIVE.includes(o.status));
	const closed = orders.filter(o => !ACTIVE.includes(o.status)).reverse();
	const itemOf = (o: StaffOrder) => snap.menu.find(m => m.id === o.itemId);
	const status = (o: StaffOrder, s: string) => act(token, { type: 'orderStatus', orderId: o.id, status: s });

	return (
		<div class="st-bar">
			{active.length === 0 && <p class="lede">No open orders.</p>}
			{active.map(o => (
				<div key={o.id} class={`card st-order ${o.status}`}>
					<div class="row">
						<strong class="grow st-who">{o.pname}</strong>
						<span class={`pill ${o.status}`}>{o.status}</span>
					</div>
					<div class="st-drink">
						<Thumb img={itemOf(o)?.img} size={48} /> {o.itemName}
					</div>
					<div class="row st-tags">
						{o.virgin && <span class="tag">Mocktail</span>}
						{o.priority && <span class="tag warn">Priority</span>}
						<span class="sub">{ago(o.ts, now)}</span>
					</div>
					{o.note && <div class="st-note">“{o.note}”</div>}
					<div class="st-btns">
						{o.status === 'queued' && (
							<button class="primary" onClick={() => status(o, 'making')}>
								Start
							</button>
						)}
						{(o.status === 'queued' || o.status === 'making') && (
							<button class="primary" onClick={() => status(o, 'ready')}>
								Ready
							</button>
						)}
						{o.status === 'ready' && (
							<button class="primary" onClick={() => status(o, 'done')}>
								Collected
							</button>
						)}
						<button
							class="ghost danger"
							onClick={() => confirm(`Cancel ${o.pname}'s ${o.itemName}? They get a refund.`) && status(o, 'cancelled')}
						>
							Cancel
						</button>
					</div>
				</div>
			))}
			<button class="ghost" onClick={() => setCharge(true)}>
				Charge someone (no phone)
			</button>
			<button class="link" onClick={() => setShowClosed(!showClosed)}>
				{showClosed ? 'Hide' : 'Show'} recent closed orders ({closed.length})
			</button>
			{showClosed && (
				<ul class="list">
					{closed.map(o => (
						<li key={o.id} class="row">
							<span class="grow">
								{o.pname} · {o.itemName}
								{o.virgin ? ' (mocktail)' : ''}
							</span>
							<span class={`pill ${o.status}`}>{o.status}</span>
							<span class="sub">{clock(o.updatedAt)}</span>
						</li>
					))}
				</ul>
			)}
			{charge && <ChargeSheet snap={snap} token={token} onClose={() => setCharge(false)} />}
		</div>
	);
}

function ChargeSheet({ snap, token, onClose }: P & { onClose: () => void }) {
	const [pid, setPid] = useState('');
	const [itemId, setItemId] = useState('');
	const [note, setNote] = useState('');
	const [qty, setQty] = useState('1');
	const item = snap.menu.find(m => m.id === itemId);
	const submit = async () => {
		if (!pid || !item) return toast('Pick a player and an item', 'error');
		const ok =
			item.serve === 'bar'
				? await act(token, { type: 'chargeOrder', pid, itemId, note }, 'Charged. Order is in.')
				: await act(token, { type: 'chargeItem', pid, itemId, qty: Number(qty) || 1 }, 'Charged.');
		if (ok) onClose();
	};
	return (
		<Sheet onClose={onClose}>
			<div class="sheet-head">
				<h2>Charge someone</h2>
				<button class="ghost small" onClick={onClose}>
					Close
				</button>
			</div>
			<div class="staff-form">
				<label>
					Player
					<select value={pid} onChange={e => setPid(e.currentTarget.value)}>
						<option value="">Choose…</option>
						{snap.players.map(p => (
							<option key={p.id} value={p.id}>
								{p.name} ({p.balance} Ê$)
							</option>
						))}
					</select>
				</label>
				<label>
					Item
					<select value={itemId} onChange={e => setItemId(e.currentTarget.value)}>
						<option value="">Choose…</option>
						{groupBy(snap.menu.filter(m => m.available && m.stock !== 0), m => m.section).map(([s, items]) => (
							<optgroup key={s} label={s}>
								{items.map(m => (
									<option key={m.id} value={m.id}>
										{m.name} · {m.price} Ê$
									</option>
								))}
							</optgroup>
						))}
					</select>
				</label>
				{item?.serve === 'bar' && (
					<>
						{item.mocktail && <p class="eyebrow">Alcohol-free</p>}
						<label>
							Note
							<input value={note} onInput={e => setNote(e.currentTarget.value)} maxLength={80} />
						</label>
					</>
				)}
				{item?.serve === 'self' && (
					<label>
						Quantity
						<input inputMode="numeric" value={qty} onInput={e => setQty(e.currentTarget.value)} />
					</label>
				)}
				<button class="primary" onClick={submit}>
					Charge{item ? ` ${item.price * (item.serve === 'self' ? Number(qty) || 1 : 1)} Ê$` : ''}
				</button>
			</div>
		</Sheet>
	);
}

// ---------------- Bank ----------------

function BankTab({ snap, token }: P) {
	const now = useNow();
	const [sel, setSel] = useState<Set<string>>(new Set());
	const [amount, setAmount] = useState('');
	const [reason, setReason] = useState('');
	const [kind, setKind] = useState<TxKind>('prize');
	const pids = snap.players.filter(p => sel.has(p.id)).map(p => p.id);
	const toggle = (id: string) => {
		const n = new Set(sel);
		n.has(id) ? n.delete(id) : n.add(id);
		setSel(n);
	};
	const grant = async (amt: number, why: string, k: TxKind) => {
		if (!pids.length) return toast('Select at least one player', 'error');
		const ok = await act(token, { type: 'grant', pids, amount: amt, reason: why, kind: k }, `${signed(amt)} Ê$ → ${pids.length} player(s)`);
		if (ok) setSel(new Set());
		return ok;
	};
	return (
		<div class="st-bank">
			<div class="row">
				<strong class="grow">Players ({sel.size} selected)</strong>
				<button class="link" onClick={() => setSel(new Set(snap.players.map(p => p.id)))}>
					All
				</button>
				<button class="link" onClick={() => setSel(new Set())}>
					Clear
				</button>
			</div>
			<div class="st-chips">
				{snap.players.map(p => (
					<button key={p.id} class={`st-chip ${sel.has(p.id) ? 'on' : ''}`} onClick={() => toggle(p.id)}>
						{p.name} <small>{p.balance}</small>
					</button>
				))}
				{!snap.players.length && <p class="lede">Nobody has joined yet.</p>}
			</div>
			<h3>Quick actions</h3>
			<div class="st-actions">
				{(snap.actions ?? []).map(a => (
					<button key={a.id} class="ghost" onClick={() => grant(a.amount, a.label, a.kind)}>
						{a.label}
						<br />
						<span class={a.amount < 0 ? 'neg' : 'pos'}>{signed(a.amount)} Ê$</span>
					</button>
				))}
			</div>
			<h3>Custom</h3>
			<div class="staff-form card">
				<div class="row">
					<input class="st-amt" inputMode="text" placeholder="Amount (−ok)" value={amount} onInput={e => setAmount(e.currentTarget.value)} />
					<select value={kind} onChange={e => setKind(e.currentTarget.value as TxKind)}>
						{TX_KINDS.map(k => (
							<option key={k}>{k}</option>
						))}
					</select>
				</div>
				<input placeholder="Reason" value={reason} onInput={e => setReason(e.currentTarget.value)} maxLength={60} />
				<button
					class="primary"
					onClick={async () => {
						const n = num(amount);
						if (!Number.isInteger(n) || n === 0) return toast('Enter a whole amount', 'error');
						if (!reason.trim()) return toast('Add a reason', 'error');
						if (await grant(n, reason.trim(), kind)) {
							setAmount('');
							setReason('');
						}
					}}
				>
					Grant to {sel.size || '…'} selected
				</button>
			</div>
			<h3>Payday</h3>
			<div class="card row">
				<span class="grow">
					<Money n={snap.settings.paydayAmount} /> each
					<br />
					<span class="sub">{snap.nextPayday ? `Next ${clock(snap.nextPayday)} · in ${countdown(snap.nextPayday, now)}` : 'Auto payday is off'}</span>
				</span>
				<button
					class="primary"
					onClick={() => confirm(`Pay ${snap.settings.paydayAmount} Ê$ to everyone now?`) && act(token, { type: 'payday' }, 'Payday!')}
				>
					Payday now
				</button>
			</div>
		</div>
	);
}

// ---------------- Menu ----------------

interface ItemDraft {
	id?: string;
	name: string;
	desc: string;
	section: string;
	price: string;
	serve: 'bar' | 'self';
	mocktail: boolean;
	stock: string;
	available: boolean;
}
const toDraft = (m: MenuItem): ItemDraft => ({
	id: m.id,
	name: m.name,
	desc: m.desc,
	section: m.section,
	price: String(m.price),
	serve: m.serve,
	mocktail: m.mocktail === true,
	stock: m.stock == null ? '' : String(m.stock),
	available: m.available,
});
const blankItem: ItemDraft = { name: '', desc: '', section: '', price: '', serve: 'bar', mocktail: false, stock: '', available: true };

function ItemForm({
	init,
	sections,
	token,
	onDone,
	submitLabel,
}: {
	init: ItemDraft;
	sections: string[];
	token: string;
	onDone: (saved: boolean) => void;
	submitLabel: string;
}) {
	const [d, setD] = useState(init);
	const set = <K extends keyof ItemDraft>(k: K, v: ItemDraft[K]) => setD({ ...d, [k]: v });
	const dl = 'sections-list';
	const save = async () => {
		const price = num(d.price);
		if (!Number.isInteger(price)) return toast('Price must be a whole number', 'error');
		const stock = d.stock.trim() === '' ? null : num(d.stock);
		if (stock !== null && !Number.isInteger(stock)) return toast('Stock must be a whole number', 'error');
		const ok = await act(
			token,
			{ type: 'saveItem', item: { id: d.id, name: d.name, desc: d.desc, section: d.section, price, serve: d.serve, mocktail: d.mocktail, stock, available: d.available } },
			'Saved',
		);
		if (ok) onDone(true);
	};
	return (
		<div class="staff-form">
			<input placeholder="Name" value={d.name} onInput={e => set('name', e.currentTarget.value)} />
			<input placeholder="Description" value={d.desc} onInput={e => set('desc', e.currentTarget.value)} />
			<input placeholder="Section" list={dl} value={d.section} onInput={e => set('section', e.currentTarget.value)} />
			<datalist id={dl}>
				{sections.map(s => (
					<option key={s} value={s} />
				))}
			</datalist>
			<div class="row">
				<input inputMode="numeric" placeholder="Price" value={d.price} onInput={e => set('price', e.currentTarget.value)} />
				<select value={d.serve} onChange={e => set('serve', e.currentTarget.value as 'bar' | 'self')}>
					<option value="bar">Bar (made)</option>
					<option value="self">Self-serve</option>
				</select>
			</div>
			<div class="row">
				{d.serve === 'bar' && <label class="check">
					<input type="checkbox" checked={d.mocktail} onChange={e => set('mocktail', e.currentTarget.checked)} /> Mocktail
				</label>}
				<input inputMode="numeric" placeholder="Stock (blank = ∞)" value={d.stock} onInput={e => set('stock', e.currentTarget.value)} />
			</div>
			<label class="check">
				<input type="checkbox" checked={d.available} onChange={e => set('available', e.currentTarget.checked)} /> Available
			</label>
			<div class="row">
				<button class="primary grow" onClick={save}>
					{submitLabel}
				</button>
				<button class="ghost" onClick={() => onDone(false)}>
					Cancel
				</button>
			</div>
		</div>
	);
}

function MenuTab({ snap, token }: P) {
	const [editing, setEditing] = useState<string | null>(null);
	const [adding, setAdding] = useState(false);
	const menu = snap.menu.filter(m => !m.archived);
	const sections = [...new Set(menu.map(m => m.section))];
	const adjustStock = (m: MenuItem, delta: number) =>
		act(token, { type: 'adjustStock', itemId: m.id, delta });
	return (
		<div>
			{adding ? (
				<div class="card">
					<h3>Add item</h3>
					<ItemForm init={blankItem} sections={sections} token={token} submitLabel="Add" onDone={() => setAdding(false)} />
				</div>
			) : (
				<button class="primary" onClick={() => setAdding(true)}>
					+ Add item
				</button>
			)}
			{groupBy(menu, m => m.section).map(([section, items]) => (
				<section key={section}>
					<h3 class="section">{section}</h3>
					{items.map(m => (
						<div key={m.id} class={`card st-item ${m.available ? '' : 'off'}`}>
							<div class="row">
								<Thumb img={m.img} size={44} fallback={m.serve === 'self' ? 'other-savouries' : 'dry-martini'} />
								<span class="grow">
									<strong>{m.name}</strong>
									<br />
									<span class="sub">
										{m.price} Ê$ · {m.serve === 'bar' ? 'bar' : 'self-serve'}
										{!m.available && ' · hidden'}
									</span>
								</span>
								<div class="stepper">
									<button onClick={() => adjustStock(m, -1)} disabled={!m.stock} aria-label={`Remove one ${m.name} from stock`}>
										−
									</button>
									<span>{m.stock == null ? '∞' : m.stock}</span>
									<button onClick={() => adjustStock(m, 1)} aria-label={`Add one ${m.name} to stock`}>+</button>
								</div>
							</div>
							<div class="row">
								<button class="ghost small" onClick={() => act(token, { type: 'setItemAvailability', itemId: m.id, available: !m.available })}>
									{m.available ? 'Hide' : 'Show'}
								</button>
								<button class="ghost small" onClick={() => setEditing(editing === m.id ? null : m.id)}>
									{editing === m.id ? 'Close' : 'Edit'}
								</button>
								<button
									class="ghost small danger"
									onClick={() => confirm(`Delete ${m.name}?`) && act(token, { type: 'deleteItem', itemId: m.id }, 'Deleted')}
								>
									Delete
								</button>
							</div>
							{editing === m.id && (
								<ItemForm init={toDraft(m)} sections={sections} token={token} submitLabel="Save" onDone={() => setEditing(null)} />
							)}
						</div>
					))}
				</section>
			))}
			<button
				class="ghost danger"
				onClick={() => confirm('Replace the whole menu with the default one?') && act(token, { type: 'restoreMenu' }, 'Menu restored')}
			>
				Restore default menu
			</button>
		</div>
	);
}

// ---------------- Perks & actions ----------------

/** Local editable copy of a server list; re-syncs from the server only while unedited. */
function useDraft<T>(source: T[]): [T[], (next: T[]) => void, boolean, () => void] {
	const json = JSON.stringify(source);
	const [draft, setDraft] = useState<T[]>(source);
	const [dirty, setDirty] = useState(false);
	useEffect(() => {
		if (!dirty) setDraft(source);
	}, [json]);
	return [
		draft,
		next => {
			setDraft(next);
			setDirty(true);
		},
		dirty,
		() => setDirty(false),
	];
}

const move = <T,>(list: T[], i: number, d: number): T[] => {
	const j = i + d;
	if (j < 0 || j >= list.length) return list;
	const c = [...list];
	[c[i], c[j]] = [c[j]!, c[i]!];
	return c;
};

type PerkRow = Omit<Perk, 'price'> & { price: string; key: string };
type ActionRow = Omit<QuickAction, 'amount'> & { amount: string; key: string };
let keyN = 0;
const newKey = () => `n${++keyN}`;

function PerksTab({ snap, token }: P) {
	const [perks, setPerks, pDirty, pClean] = useDraft<PerkRow>(snap.perks.map(p => ({ ...p, price: String(p.price), key: p.id })));
	const [actions, setActions, aDirty, aClean] = useDraft<ActionRow>((snap.actions ?? []).map(a => ({ ...a, amount: String(a.amount), key: a.id })));
	const upP = (i: number, patch: Partial<PerkRow>) => setPerks(perks.map((p, j) => (j === i ? { ...p, ...patch } : p)));
	const upA = (i: number, patch: Partial<ActionRow>) => setActions(actions.map((p, j) => (j === i ? { ...p, ...patch } : p)));

	const savePerks = async () => {
		const list = perks.map(p => ({ id: p.id, name: p.name, price: num(p.price), needsTarget: p.needsTarget, effect: p.effect }));
		if (list.some(p => !Number.isInteger(p.price))) return toast('Perk prices must be whole numbers', 'error');
		if (await act(token, { type: 'setPerks', perks: list }, 'Perks saved')) pClean();
	};
	const saveActions = async () => {
		const list = actions.map(a => ({ id: a.id, label: a.label, amount: num(a.amount), kind: a.kind }));
		if (list.some(a => !Number.isInteger(a.amount))) return toast('Amounts must be whole numbers', 'error');
		if (await act(token, { type: 'setActions', actions: list }, 'Quick actions saved')) aClean();
	};

	return (
		<div>
			<h3>Perks</h3>
			{perks.map((p, i) => (
				<div key={p.key} class="card staff-form">
					<input placeholder="Name" value={p.name} onInput={e => upP(i, { name: e.currentTarget.value })} />
					<div class="row">
						<input inputMode="numeric" placeholder="Price" value={p.price} onInput={e => upP(i, { price: e.currentTarget.value })} />
						<select value={p.effect} onChange={e => upP(i, { effect: e.currentTarget.value as Perk['effect'] })}>
							<option value="none">Announce only</option>
							<option value="skipQueue">Skip drinks queue</option>
						</select>
					</div>
					<label class="check">
						<input type="checkbox" checked={p.needsTarget} onChange={e => upP(i, { needsTarget: e.currentTarget.checked })} /> Needs a target player
					</label>
					<div class="row">
						<button class="ghost small" onClick={() => setPerks(move(perks, i, -1))}>
							↑
						</button>
						<button class="ghost small" onClick={() => setPerks(move(perks, i, 1))}>
							↓
						</button>
						<span class="grow" />
						<button class="ghost small danger" onClick={() => setPerks(perks.filter((_, j) => j !== i))}>
							Delete
						</button>
					</div>
				</div>
			))}
			<div class="row">
				<button
					class="ghost"
					onClick={() => setPerks([...perks, { id: '', key: newKey(), name: '', price: '10', needsTarget: false, effect: 'none' }])}
				>
					+ Add perk
				</button>
				<button class="primary grow" disabled={!pDirty} onClick={savePerks}>
					Save perks
				</button>
			</div>

			<h3>Quick actions</h3>
			{actions.map((a, i) => (
				<div key={a.key} class="card staff-form">
					<input placeholder="Label" value={a.label} onInput={e => upA(i, { label: e.currentTarget.value })} />
					<div class="row">
						<input inputMode="text" placeholder="Amount" value={a.amount} onInput={e => upA(i, { amount: e.currentTarget.value })} />
						<select value={a.kind} onChange={e => upA(i, { kind: e.currentTarget.value as TxKind })}>
							{TX_KINDS.map(k => (
								<option key={k}>{k}</option>
							))}
						</select>
					</div>
					<div class="row">
						<button class="ghost small" onClick={() => setActions(move(actions, i, -1))}>
							↑
						</button>
						<button class="ghost small" onClick={() => setActions(move(actions, i, 1))}>
							↓
						</button>
						<span class="grow" />
						<button class="ghost small danger" onClick={() => setActions(actions.filter((_, j) => j !== i))}>
							Delete
						</button>
					</div>
				</div>
			))}
			<div class="row">
				<button class="ghost" onClick={() => setActions([...actions, { id: '', key: newKey(), label: '', amount: '10', kind: 'prize' }])}>
					+ Add action
				</button>
				<button class="primary grow" disabled={!aDirty} onClick={saveActions}>
					Save actions
				</button>
			</div>
		</div>
	);
}

// ---------------- Players ----------------

function PlayersTab({ snap, token }: P) {
	const [name, setName] = useState('');
	const [pin, setPin] = useState('');
	const [open, setOpen] = useState<string | null>(null);
	return (
		<div>
			<div class="card staff-form">
				<h3>Add player</h3>
				<input placeholder="Name" value={name} onInput={e => setName(e.currentTarget.value)} />
				<input placeholder="4-digit PIN" inputMode="numeric" maxLength={4} value={pin} onInput={e => setPin(e.currentTarget.value)} />
				<button
					class="primary"
					onClick={async () => {
						if (await act(token, { type: 'addPlayer', name, pin }, 'Player added')) {
							setName('');
							setPin('');
						}
					}}
				>
					Add
				</button>
			</div>
			<ul class="list">
				{snap.players.map(p => (
					<li key={p.id}>
						<div class="row" onClick={() => setOpen(open === p.id ? null : p.id)}>
							<strong class="grow">{p.name}</strong>
							<Money n={p.balance} />
						</div>
						{open === p.id && <PlayerEdit id={p.id} name={p.name} token={token} />}
					</li>
				))}
			</ul>
		</div>
	);
}

function PlayerEdit({ id, name, token }: { id: string; name: string; token: string }) {
	const [n, setN] = useState(name);
	const [pin, setPin] = useState('');
	return (
		<div class="staff-form">
			<div class="row">
				<input class="grow" value={n} onInput={e => setN(e.currentTarget.value)} />
				<button class="ghost small" disabled={!n.trim() || n === name} onClick={() => act(token, { type: 'renamePlayer', pid: id, name: n }, 'Renamed')}>
					Rename
				</button>
			</div>
			<div class="row">
				<input class="grow" placeholder="New PIN" inputMode="numeric" maxLength={4} value={pin} onInput={e => setPin(e.currentTarget.value)} />
				<button
					class="ghost small"
					disabled={!pin}
					onClick={async () => (await act(token, { type: 'resetPin', pid: id, pin }, 'PIN reset')) && setPin('')}
				>
					Reset PIN
				</button>
			</div>
			<button
				class="ghost small danger"
				onClick={() => confirm(`Remove ${name}? Their open orders are cancelled.`) && act(token, { type: 'removePlayer', pid: id }, 'Removed')}
			>
				Remove player
			</button>
		</div>
	);
}

// ---------------- Log ----------------

function LogRow({ g, token }: { g: LogGroup; token: string }) {
	const [all, setAll] = useState(false);
	const shown = all || g.entries.length <= 4 ? g.entries : g.entries.slice(0, 3);
	const total = g.entries.reduce((s, e) => s + e.amt, 0);
	return (
		<li class={`st-log ${g.undone ? 'undone' : ''}`}>
			<div class="row">
				<span class="sub">{clock(g.ts)}</span>
				<span class="tag">{g.kind}</span>
				<strong class="grow">{g.reason}</strong>
				{g.kind !== 'order' && (
					<button class="ghost small" onClick={() => act(token, { type: 'undo', group: g.group })}>
						{g.undone ? 'Redo' : 'Undo'}
					</button>
				)}
			</div>
			<div class="sub">
				{shown.map((e, i) => (
					<span key={i} class={e.amt < 0 ? 'neg' : 'pos'}>
						{i ? ', ' : ''}
						{e.pname} {signed(e.amt)}
					</span>
				))}
				{shown.length < g.entries.length && (
					<button class="link" onClick={() => setAll(true)}>
						{' '}
						+{g.entries.length - shown.length} more (total {signed(total)})
					</button>
				)}
			</div>
		</li>
	);
}

function LogTab({ snap, token }: P) {
	const log = snap.log ?? [];
	return <ul class="list">{log.length ? log.map(g => <LogRow key={g.group} g={g} token={token} />) : <li class="lede">Nothing yet.</li>}</ul>;
}

// ---------------- Settings ----------------

function SettingsTab({ snap, token }: P) {
	const s = snap.settings;
	const [d, setD] = useState({
		startBalance: String(s.startBalance),
		paydayAmount: String(s.paydayAmount),
		paydayHours: s.paydayHours.join(','),
		autoPayday: s.autoPayday,
		maxActiveOrders: String(s.maxActiveOrders),
	});
	const [word, setWord] = useState('');
	const save = async () => {
		const hours = d.paydayHours.split(',').map(h => h.trim()).filter(Boolean).map(Number);
		const nums = [num(d.startBalance), num(d.paydayAmount), num(d.maxActiveOrders), ...hours];
		if (nums.some(n => !Number.isInteger(n))) return toast('Use whole numbers only', 'error');
		const settings: Partial<Settings> = {
			startBalance: num(d.startBalance),
			paydayAmount: num(d.paydayAmount),
			paydayHours: hours,
			autoPayday: d.autoPayday,
			maxActiveOrders: num(d.maxActiveOrders),
		};
		await act(token, { type: 'settings', settings }, 'Settings saved');
	};
	return (
		<div>
			<div class="card staff-form">
				<label>
					Start balance
					<input inputMode="numeric" value={d.startBalance} onInput={e => setD({ ...d, startBalance: e.currentTarget.value })} />
				</label>
				<label>
					Payday amount
					<input inputMode="numeric" value={d.paydayAmount} onInput={e => setD({ ...d, paydayAmount: e.currentTarget.value })} />
				</label>
				<label>
					Payday hours (Lisbon, comma-separated)
					<input value={d.paydayHours} onInput={e => setD({ ...d, paydayHours: e.currentTarget.value })} placeholder="19,20,21,22,23,0" />
				</label>
				<label class="check">
					<input type="checkbox" checked={d.autoPayday} onChange={e => setD({ ...d, autoPayday: e.currentTarget.checked })} /> Auto payday
				</label>
				<label>
					Max drinks in queue per guest
					<input inputMode="numeric" value={d.maxActiveOrders} onInput={e => setD({ ...d, maxActiveOrders: e.currentTarget.value })} />
				</label>
				<button class="primary" onClick={save}>
					Save settings
				</button>
			</div>
			<div class="card">
				<p>
					Guests join at
					<br />
					<strong>{location.origin}</strong>
				</p>
				<p>
					TV screen
					<br />
					<strong>{location.origin}/tv</strong>
				</p>
			</div>
			<div class="card staff-form st-danger">
				<h3>Danger zone</h3>
				<p class="sub">Wipes all players, money and orders. Menu, perks and settings stay.</p>
				<input placeholder="Type RESET" value={word} onInput={e => setWord(e.currentTarget.value)} />
				<button
					class="danger"
					disabled={word !== 'RESET'}
					onClick={async () => (await act(token, { type: 'reset', confirm: 'RESET' }, 'Party reset')) && setWord('')}
				>
					Reset party
				</button>
			</div>
		</div>
	);
}
