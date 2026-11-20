import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { BARTENDERS_CHOICE_ID, type MenuItem, type Order, type Perk, type Snapshot } from '../shared';
import { act, ago, chime, clock, countdown, FeedArt, feedText, GUEST_KEY, Illustration, Money, post, Thumb, toast, unlockAudio, useNow, useSnapshot, useStored } from './lib';

export function Guest() {
	const [token, setToken] = useStored(GUEST_KEY);
	const { snap, online } = useSnapshot(token);
	useEffect(() => {
		if (snap?.authError) setToken(null);
	}, [snap?.authError]);
	if (!token) return <Join onToken={setToken} />;
	if (!snap?.me) return <div class="loading">Loading…</div>;
	return <GuestHome snap={snap} token={token} online={online} onLogout={() => setToken(null)} />;
}

function Join({ onToken }: { onToken: (t: string) => void }) {
	const [mode, setMode] = useState<'join' | 'login'>('join');
	const [name, setName] = useState('');
	const [pin, setPin] = useState('');
	const [busy, setBusy] = useState(false);
	const submit = async (e: Event) => {
		e.preventDefault();
		unlockAudio();
		setBusy(true);
		try {
			const { token } = await post<{ token: string }>(mode === 'join' ? '/api/join' : '/api/login', { name, pin });
			onToken(token);
		} catch (err) {
			toast((err as Error).message, 'error');
		} finally {
			setBusy(false);
		}
	};
	return (
		<main class="join">
			<aside class="join-art" aria-hidden="true">
				<Illustration name="menu-coupe" />
			</aside>
			<div class="join-panel">
				<p class="eyebrow">Inês’s Cocktail Bar</p>
				<h1>Inêscudos</h1>
				<form class="card" onSubmit={submit}>
					<label>
						Your name
						<input value={name} onInput={e => setName(e.currentTarget.value)} maxLength={24} autoComplete="nickname" required />
					</label>
					<label>
						4-digit PIN
						<input
							value={pin}
							onInput={e => setPin(e.currentTarget.value.replace(/\D/g, '').slice(0, 4))}
							inputMode="numeric"
							pattern="\d{4}"
							type="password"
							autoComplete="off"
							required
						/>
					</label>
					<button class="primary" disabled={busy}>
						{mode === 'join' ? 'Join' : 'Log in'}
					</button>
					{mode === 'join' && <p class="hint">Keep your PIN to sign in again.</p>}
				</form>
				<button class="link" onClick={() => setMode(mode === 'join' ? 'login' : 'join')}>
					{mode === 'join' ? 'Log in' : 'Join'}
				</button>
			</div>
		</main>
	);
}

type Tab = 'drinks' | 'food' | 'perks' | 'wallet' | 'board';

function GuestHome({ snap, token, online, onLogout }: { snap: Snapshot; token: string; online: boolean; onLogout: () => void }) {
	const [tab, setTab] = useState<Tab>('drinks');
	const ready = useGuestEvents(snap);
	const now = useNow();
	const me = snap.me!;
	return (
		<div class="app guest" onClick={unlockAudio}>
			<header class="top">
				<div class="brand"><Illustration name="menu-pianist" /><span>Inêscudos</span></div>
				<div class="guest-account">
					<div class="who">{me.name}</div>
					{snap.nextPayday && <div class="payday">Payday in {countdown(snap.nextPayday, now)}</div>}
				</div>
				<Money n={me.balance} big />
			</header>
			{!online && <div class="offline">Reconnecting…</div>}
			<main class="content">
				{tab === 'drinks' && <MenuTab snap={snap} token={token} serve="bar" />}
				{tab === 'food' && <MenuTab snap={snap} token={token} serve="self" />}
				{tab === 'perks' && <PerksTab snap={snap} token={token} />}
				{tab === 'wallet' && <WalletTab snap={snap} token={token} onLogout={onLogout} />}
				{tab === 'board' && <Board snap={snap} />}
			</main>
			<nav class="tabs" aria-label="Navigation">
				{(
					[
						['drinks', 'dry-martini', 'Drinks'],
						['food', 'chocolate-cake', 'Food'],
						['perks', 'nav-perks', 'Perks'],
						['wallet', 'coins', 'Wallet'],
						['board', 'nav-board', 'Board'],
					] as const
				).map(([id, icon, label]) => (
					<button key={id} class={tab === id ? 'on' : ''} aria-pressed={tab === id} onClick={() => setTab(id)}>
						<Illustration name={icon} />
						{label}
					</button>
				))}
			</nav>
			{ready.order && (
				<div class="ready-banner" onClick={ready.dismiss}>
					<Illustration name="dry-martini" className="ready-art" />
					<h2>{ready.order.itemName} is ready</h2>
					<p>Collect it at the bar.</p>
					<button class="primary">Dismiss</button>
				</div>
			)}
		</div>
	);
}

/** Drink-ready alert and incoming-money toasts, derived from snapshot diffs. */
function useGuestEvents(snap: Snapshot): { order: Order | null; dismiss: () => void } {
	const prev = useRef<Snapshot | null>(null);
	const [order, setOrder] = useState<Order | null>(null);
	useEffect(() => {
		const p = prev.current;
		prev.current = snap;
		if (!p?.myOrders || !p.myTx) return;
		const was = new Map(p.myOrders.map(o => [o.id, o.status]));
		const nowReady = snap.myOrders?.find(o => o.status === 'ready' && was.has(o.id) && was.get(o.id) !== 'ready');
		if (nowReady) {
			setOrder(nowReady);
			chime(3);
			navigator.vibrate?.([200, 100, 200]);
		}
		const seen = new Set(p.myTx.map(t => t.id));
		for (const t of snap.myTx ?? []) if (!seen.has(t.id) && t.amt > 0) toast(`+${t.amt} Ê$ · ${t.reason}`);
	}, [snap]);
	return { order, dismiss: () => setOrder(null) };
}

function groupBy<T>(list: T[], key: (t: T) => string): [string, T[]][] {
	const map = new Map<string, T[]>();
	for (const x of list) {
		const k = key(x);
		const arr = map.get(k);
		if (arr) arr.push(x);
		else map.set(k, [x]);
	}
	return [...map];
}

const STATUS_LABEL: Record<string, string> = {
	queued: 'In line',
	making: 'Being made',
	ready: 'Ready',
	done: 'Collected',
	cancelled: 'Cancelled',
};

function MenuTab({ snap, token, serve }: { snap: Snapshot; token: string; serve: MenuItem['serve'] }) {
	const [pickedId, setPickedId] = useState<string | null>(null);
	const [mocktails, setMocktails] = useState(false);
	const picked = snap.menu.find(item => item.id === pickedId);
	const menu = snap.menu.filter(item => !item.archived && item.serve === serve &&
		(serve === 'self' || (item.mocktail === true) === mocktails));
	const featured = menu.find(item => item.id === BARTENDERS_CHOICE_ID);
	const now = useNow(30_000);
	const active = (snap.myOrders ?? []).filter(o => o.status === 'queued' || o.status === 'making' || o.status === 'ready');
	// server sends the queue in serving order (skip-the-queue first, then oldest)
	const line = snap.queue.filter(q => q.status !== 'ready');
	return (
		<>
			<div class={`menu-masthead ${serve === 'self' ? 'food-masthead' : ''}`}>
				<Illustration name={serve === 'bar' ? 'menu-coupe' : 'other-savouries'} className="menu-hero-art" />
				<div>
					<p class="eyebrow">Inês’s Cocktail Bar</p>
					<h1>{serve === 'bar' ? 'Drinks' : 'Food'}</h1>
					{serve === 'self' && <p class="lede">Self-service. Pay before collecting.</p>}
					{serve === 'bar' && (
						<div class="menu-switch" role="group" aria-label="Drinks menu">
							<button class={!mocktails ? 'on' : ''} aria-pressed={!mocktails} onClick={() => setMocktails(false)}>Cocktails</button>
							<button class={mocktails ? 'on' : ''} aria-pressed={mocktails} onClick={() => setMocktails(true)}>Mocktails</button>
						</div>
					)}
				</div>
				<Illustration name={serve === 'bar' ? 'menu-waiter' : 'chocolate-cake'} className="menu-side-art" />
			</div>
			{serve === 'bar' && !snap.settings.barOpen && <div class="notice">Bar closed. Food is still available.</div>}
			{serve === 'bar' && active.length > 0 && (
				<section class="card my-orders">
					<h3>Your orders</h3>
					{active.map(o => {
						const pos = line.findIndex(q => q.id === o.id) + 1;
						return (
							<div class="order-row" key={o.id}>
								<div>
									<strong>{o.itemName}</strong>
									{o.virgin && <span class="tag">mocktail</span>}
									{o.priority && <span class="tag warn">Priority</span>}
									<div class="sub">
										{o.status === 'queued' && pos > 0 ? `#${pos} in line · ` : ''}
										{ago(o.ts, now)}
									</div>
								</div>
								<span class={`pill ${o.status}`}>{STATUS_LABEL[o.status]}</span>
								{o.status === 'queued' && (
									<button class="small ghost" onClick={() => act(token, { type: 'cancelOrder', orderId: o.id }, 'Cancelled, coins refunded')}>
										Cancel
									</button>
								)}
							</div>
						);
					})}
				</section>
			)}
			{featured && <MenuEntry item={featured} featured onPick={() => setPickedId(featured.id)} />}
			{groupBy(menu.filter(item => item !== featured), item => item.section).map(([section, items]) => (
				<section class="menu-section" key={section}>
					<h2 class="section">{section}</h2>
					<div class="menu-grid">
						{items.map(item => <MenuEntry key={item.id} item={item} onPick={() => setPickedId(item.id)} />)}
					</div>
				</section>
			))}
			{picked && <ItemSheet key={picked.id} item={picked} snap={snap} token={token} onClose={() => setPickedId(null)} />}
		</>
	);
}

function MenuEntry({ item, featured = false, onPick }: { item: MenuItem; featured?: boolean; onPick: () => void }) {
	const soldOut = item.stock === 0;
	const unavailable = !item.available || soldOut;
	return (
		<button class={`item${featured ? ' featured-drink' : ''}${unavailable ? ' out' : ''}`} disabled={unavailable} onClick={onPick}>
			<Thumb img={item.img} fallback={item.serve === 'self' ? 'other-savouries' : 'dry-martini'} size={featured ? 102 : 68} />
			<div class="item-body">
				<strong>{item.name}</strong>
				<span class="sub">{item.desc}</span>
				{item.stock != null && item.stock > 0 && <span class="tag warn">{item.stock} left</span>}
			</div>
			<div class="price">
				{unavailable ? <span class="tag">{soldOut ? 'Sold out' : 'Unavailable'}</span> : <Money n={item.price} />}
			</div>
		</button>
	);
}

export function Sheet({ onClose, children }: { onClose: () => void; children: ComponentChildren }) {
	return (
		<div class="backdrop" onClick={onClose}>
			<div class="sheet" onClick={e => e.stopPropagation()}>
				{children}
			</div>
		</div>
	);
}

function ItemSheet({ item, snap, token, onClose }: { item: MenuItem; snap: Snapshot; token: string; onClose: () => void }) {
	const [note, setNote] = useState('');
	const [selection, setQty] = useState(1);
	const [busy, setBusy] = useState(false);
	const bar = item.serve === 'bar';
	const maxQty = Math.min(20, item.stock ?? 20);
	const qty = Math.min(selection, Math.max(1, maxQty));
	const unavailable = !item.available || maxQty === 0;
	const total = item.price * (bar ? 1 : qty);
	const after = snap.me!.balance - total;
	const submit = async () => {
		setBusy(true);
		const ok = bar
			? await act(token, { type: 'order', itemId: item.id, note }, 'Order placed')
			: await act(token, { type: 'buy', itemId: item.id, qty }, 'Paid');
		setBusy(false);
		if (ok) onClose();
	};
	return (
		<Sheet onClose={onClose}>
			<div class="sheet-head">
				<Thumb img={item.img} fallback={bar ? 'dry-martini' : 'other-savouries'} size={104} />
				<div>
					<h2>{item.name}</h2>
					<p class="sub">{item.desc}</p>
				</div>
			</div>
			{bar ? (
				<>
					{item.mocktail && <p class="eyebrow">Alcohol-free</p>}
					<label>
						Order note (optional)
						<input value={note} onInput={e => setNote(e.currentTarget.value)} maxLength={120} />
					</label>
				</>
			) : (
				<div class="stepper">
					<button class="ghost" aria-label="Decrease quantity" disabled={qty <= 1} onClick={() => setQty(qty - 1)}>
						−
					</button>
					<strong>{qty}</strong>
					<button class="ghost" aria-label="Increase quantity" disabled={qty >= maxQty} onClick={() => setQty(qty + 1)}>
						+
					</button>
				</div>
			)}
			<div class="totals">
				<span>
					Total <Money n={total} />
				</span>
				<span class={after < 0 ? 'neg' : 'sub'}>
					Balance after <Money n={after} />
				</span>
			</div>
			{bar && !snap.settings.barOpen && <div class="notice">Bar closed</div>}
			<button class="primary" disabled={busy || unavailable || after < 0 || (bar && !snap.settings.barOpen)} onClick={submit}>
				{unavailable ? 'Sold out' : after < 0 ? 'Not enough coins' : bar ? 'Order' : 'Pay'}
			</button>
		</Sheet>
	);
}

const illustratedPerks = new Set([
	'skip-queue', 'karaoke-jump', 'mic-moment', 'pick-song', 'song-veto',
	'force-duet', 'force-solo', 'quiz-category', 'quiz-5050', 'steal-question',
]);

function perkArt(id: string) {
	return illustratedPerks.has(id) ? `perk-${id}` : 'nav-perks';
}

function PerksTab({ snap, token }: { snap: Snapshot; token: string }) {
	const [pickedId, setPickedId] = useState<string | null>(null);
	const picked = snap.perks.find(perk => perk.id === pickedId);
	return (
		<>
			<header class="menu-masthead perks-masthead">
				<div class="perks-title">
					<Illustration name="nav-perks" />
					<h1>Perks</h1>
				</div>
			</header>
			{snap.perks.length === 0 && <p class="sub perks-empty">No perks available.</p>}
			<div class="perks-grid">
				{snap.perks.map(perk => (
					<button key={perk.id} class="perk-tile" onClick={() => setPickedId(perk.id)}>
						<Illustration name={perkArt(perk.id)} />
						<strong>{perk.name}</strong>
						<Money n={perk.price} />
					</button>
				))}
			</div>
			<section class="menu-section">
				<h2 class="section">Recent perks</h2>
				<Feed items={snap.feed.filter(f => f.kind === 'perk').slice(0, 10)} empty="No perks used yet." />
			</section>
			{picked && <PerkSheet key={picked.id} perk={picked} snap={snap} token={token} onClose={() => setPickedId(null)} />}
		</>
	);
}

function PerkSheet({ perk, snap, token, onClose }: { perk: Perk; snap: Snapshot; token: string; onClose: () => void }) {
	const [target, setTarget] = useState('');
	const [busy, setBusy] = useState(false);
	const others = snap.players.filter(p => p.id !== snap.me!.id).sort((a, b) => a.name.localeCompare(b.name));
	const after = snap.me!.balance - perk.price;
	return (
		<Sheet onClose={onClose}>
			<div class="sheet-head perk-sheet-head">
				<Illustration name={perkArt(perk.id)} />
				<h2>{perk.name}</h2>
			</div>
			{perk.effect === 'skipQueue' && <p class="sub">Place a drink order first.</p>}
			{perk.needsTarget && (
				<label>
					Guest
					<select value={target} onChange={e => setTarget(e.currentTarget.value)}>
						<option value="">Select a guest</option>
						{others.map(p => (
							<option key={p.id} value={p.id}>
								{p.name}
							</option>
						))}
					</select>
				</label>
			)}
			<div class="totals">
				<span>
					Price <Money n={perk.price} />
				</span>
				<span class={after < 0 ? 'neg' : 'sub'}>
					Balance after <Money n={after} />
				</span>
			</div>
			<button
				class="primary"
				disabled={busy || after < 0 || (perk.needsTarget && !target)}
				onClick={async () => {
					setBusy(true);
					const ok = await act(token, { type: 'buyPerk', perkId: perk.id, target }, 'Perk purchased');
					setBusy(false);
					if (ok) onClose();
				}}
			>
				{after < 0 ? 'Not enough coins' : 'Buy'}
			</button>
		</Sheet>
	);
}

function WalletTab({ snap, token, onLogout }: { snap: Snapshot; token: string; onLogout: () => void }) {
	const [to, setTo] = useState('');
	const [amount, setAmount] = useState('');
	const [note, setNote] = useState('');
	const others = snap.players.filter(p => p.id !== snap.me!.id).sort((a, b) => a.name.localeCompare(b.name));
	const send = async (e: Event) => {
		e.preventDefault();
		if (await act(token, { type: 'transfer', to, amount: Number(amount), note }, 'Coins sent')) {
			setAmount('');
			setNote('');
		}
	};
	return (
		<>
			{snap.nextPayday != null && (
				<section class="card">
					<h3>Next payday</h3>
					<p class="sub">{clock(snap.nextPayday)} · +{snap.settings.paydayAmount} Ê$</p>
				</section>
			)}
			<form class="card" onSubmit={send}>
				<h3>Send coins</h3>
				<label>
					To
					<select value={to} onChange={e => setTo(e.currentTarget.value)} required>
						<option value="">Select a guest</option>
						{others.map(p => (
							<option key={p.id} value={p.id}>
								{p.name}
							</option>
						))}
					</select>
				</label>
				<div class="row">
					<label>
						Amount
						<input value={amount} onInput={e => setAmount(e.currentTarget.value.replace(/\D/g, ''))} inputMode="numeric" required />
					</label>
					<label class="grow">
						Note
						<input value={note} onInput={e => setNote(e.currentTarget.value)} maxLength={60} />
					</label>
				</div>
				<button class="primary" disabled={!to || !amount}>
					Send
				</button>
			</form>
			<section class="card">
				<h3>History</h3>
				{(snap.myTx ?? []).length === 0 && <p class="sub">No transactions.</p>}
				{(snap.myTx ?? []).map(t => (
					<div key={t.id} class={`tx ${t.undone ? 'undone' : ''}`}>
						<span>{t.reason}</span>
						<span class={t.amt < 0 ? 'neg' : 'pos'}>
							{t.amt > 0 ? '+' : ''}
							{t.amt}
						</span>
					</div>
				))}
			</section>
			<button
				class="link"
				onClick={() => {
					if (confirm('Log out? Use your name and PIN to sign in again.')) onLogout();
				}}
			>
				Log out
			</button>
		</>
	);
}

export function Board({ snap, compact }: { snap: Snapshot; compact?: boolean }) {
	const rich = [...snap.players].sort((a, b) => b.balance - a.balance);
	const earners = [...snap.players].filter(p => p.earned > 0).sort((a, b) => b.earned - a.earned);
	const meId = snap.me?.id;
	return (
		<>
			<section class="card">
				<h3>Top balances</h3>
				<ol class="ranks">
					{rich.slice(0, compact ? 10 : undefined).map(p => (
						<li key={p.id} class={p.id === meId ? 'me' : ''}>
							<span>{p.name}</span>
							<Money n={p.balance} />
						</li>
					))}
				</ol>
			</section>
			<section class="card">
				<h3>Prize leaders</h3>
				{earners.length === 0 && <p class="sub">No prizes yet.</p>}
				<ol class="ranks">
					{earners.slice(0, compact ? 5 : undefined).map(p => (
						<li key={p.id} class={p.id === meId ? 'me' : ''}>
							<span>{p.name}</span>
							<Money n={p.earned} />
						</li>
					))}
				</ol>
			</section>
			{!compact && (
				<>
					<h2 class="section">Activity</h2>
					<Feed items={snap.feed} empty="No activity yet." />
				</>
			)}
		</>
	);
}

export function Feed({ items, empty }: { items: Snapshot['feed']; empty: string }) {
	const now = useNow(30_000);
	if (!items.length) return <p class="sub">{empty}</p>;
	return (
		<ul class="feed">
			{items.map(f => (
				<li key={f.id} class={f.kind}>
					<FeedArt kind={f.kind} /><span>{feedText(f.text)}</span>
					<time>{ago(f.ts, now)}</time>
				</li>
			))}
		</ul>
	);
}
