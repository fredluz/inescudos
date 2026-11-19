import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { MenuItem, Order, Perk, Snapshot } from '../shared';
import { act, ago, chime, countdown, GUEST_KEY, Money, post, Thumb, toast, unlockAudio, useNow, useSnapshot, useStored } from './lib';

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
			<h1 class="script">Inêscudos</h1>
			<p class="lede">Party money for Inês's birthday: drinks, sweets, perks, poker.</p>
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
					{mode === 'join' ? 'Join the party' : 'Log in'}
				</button>
				<p class="hint">
					{mode === 'join' ? 'Remember the PIN: you need it to log in again on another phone.' : 'Same name and PIN you joined with.'}
				</p>
			</form>
			<button class="link" onClick={() => setMode(mode === 'join' ? 'login' : 'join')}>
				{mode === 'join' ? 'Already joined? Log in' : 'New here? Join'}
			</button>
		</main>
	);
}

type Tab = 'drinks' | 'sweets' | 'perks' | 'wallet' | 'board';

function GuestHome({ snap, token, online, onLogout }: { snap: Snapshot; token: string; online: boolean; onLogout: () => void }) {
	const [tab, setTab] = useState<Tab>('drinks');
	const ready = useGuestEvents(snap);
	const now = useNow();
	const me = snap.me!;
	return (
		<div class="app guest" onClick={unlockAudio}>
			<header class="top">
				<div>
					<div class="who">{me.name}</div>
					{snap.nextPayday && <div class="payday">Payday in {countdown(snap.nextPayday, now)}</div>}
				</div>
				<Money n={me.balance} big />
			</header>
			{!online && <div class="offline">Reconnecting…</div>}
			<main class="content">
				{tab === 'drinks' && <MenuTab snap={snap} token={token} serve="bar" />}
				{tab === 'sweets' && <MenuTab snap={snap} token={token} serve="self" />}
				{tab === 'perks' && <PerksTab snap={snap} token={token} />}
				{tab === 'wallet' && <WalletTab snap={snap} token={token} onLogout={onLogout} />}
				{tab === 'board' && <Board snap={snap} />}
			</main>
			<nav class="tabs">
				{(
					[
						['drinks', '🍸', 'Drinks'],
						['sweets', '🍰', 'Sweets'],
						['perks', '📣', 'Perks'],
						['wallet', '👛', 'Wallet'],
						['board', '🏆', 'Board'],
					] as const
				).map(([id, icon, label]) => (
					<button key={id} class={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
						<span>{icon}</span>
						{label}
					</button>
				))}
			</nav>
			{ready.order && (
				<div class="ready-banner" onClick={ready.dismiss}>
					<div class="big-emoji">🍸</div>
					<h2>Your {ready.order.itemName} is ready!</h2>
					<p>Go grab it from the bar.</p>
					<button class="primary">On my way</button>
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
	ready: 'Ready!',
	done: 'Collected',
	cancelled: 'Cancelled',
};

function MenuTab({ snap, token, serve }: { snap: Snapshot; token: string; serve: MenuItem['serve'] }) {
	const [picked, setPicked] = useState<MenuItem | null>(null);
	const now = useNow(30_000);
	const active = (snap.myOrders ?? []).filter(o => o.status === 'queued' || o.status === 'making' || o.status === 'ready');
	// server sends the queue in serving order (skip-the-queue first, then oldest)
	const line = snap.queue.filter(q => q.status !== 'ready');
	return (
		<>
			{serve === 'self' && <p class="lede small">Pay here, then help yourself at the table. Honour system: Inês is watching.</p>}
			{serve === 'bar' && !snap.settings.barOpen && <div class="notice">The bar is closed for a moment. Sweets are still open.</div>}
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
									{o.priority && <span class="tag warn">⚡ skipped the queue</span>}
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
			{groupBy(
				snap.menu.filter(m => m.serve === serve),
				m => m.section,
			).map(([section, items]) => (
				<section key={section}>
					<h2 class="section">{section}</h2>
					<div class="menu-grid">
						{items.map(it => {
							const soldOut = !it.available || it.stock === 0;
							return (
								<button key={it.id} class={`item ${soldOut ? 'out' : ''}`} disabled={soldOut} onClick={() => setPicked(it)}>
									<Thumb img={it.img} emoji={it.emoji} />
									<div class="item-body">
										<strong>{it.name}</strong>
										<span class="sub">{it.desc}</span>
										{it.stock != null && it.stock > 0 && it.stock <= 5 && <span class="tag warn">{it.stock} left</span>}
									</div>
									<div class="price">{soldOut ? <span class="tag">Out</span> : <Money n={it.price} />}</div>
								</button>
							);
						})}
					</div>
				</section>
			))}
			{picked && <ItemSheet item={picked} snap={snap} token={token} onClose={() => setPicked(null)} />}
		</>
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
	const [virgin, setVirgin] = useState(false);
	const [note, setNote] = useState('');
	const [qty, setQty] = useState(1);
	const [busy, setBusy] = useState(false);
	const bar = item.serve === 'bar';
	const total = item.price * (bar ? 1 : qty);
	const after = snap.me!.balance - total;
	const submit = async () => {
		setBusy(true);
		const ok = bar
			? await act(token, { type: 'order', itemId: item.id, virgin, note }, 'Ordered! You will get a ping when it is ready.')
			: await act(token, { type: 'buy', itemId: item.id, qty }, `Paid. Go grab your ${item.name}!`);
		setBusy(false);
		if (ok) onClose();
	};
	return (
		<Sheet onClose={onClose}>
			<div class="sheet-head">
				<Thumb img={item.img} emoji={item.emoji} size={88} />
				<div>
					<h2>{item.name}</h2>
					<p class="sub">{item.desc}</p>
				</div>
			</div>
			{bar ? (
				<>
					<label class="check">
						<input type="checkbox" checked={virgin} onChange={e => setVirgin(e.currentTarget.checked)} />
						Make it a mocktail
					</label>
					<label>
						Note for Inês (optional)
						<input value={note} onInput={e => setNote(e.currentTarget.value)} maxLength={120} placeholder="less sweet, extra lime…" />
					</label>
				</>
			) : (
				<div class="stepper">
					<button class="ghost" onClick={() => setQty(Math.max(1, qty - 1))}>
						−
					</button>
					<strong>{qty}</strong>
					<button class="ghost" onClick={() => setQty(Math.min(20, qty + 1, item.stock ?? 20))}>
						+
					</button>
				</div>
			)}
			<div class="totals">
				<span>
					Total <Money n={total} />
				</span>
				<span class={after < 0 ? 'neg' : 'sub'}>
					Left after: <Money n={after} />
				</span>
			</div>
			{bar && !snap.settings.barOpen && <div class="notice">The bar is closed right now.</div>}
			<button class="primary" disabled={busy || after < 0 || (bar && !snap.settings.barOpen)} onClick={submit}>
				{after < 0 ? 'Not enough coins' : bar ? 'Order' : 'Pay & grab'}
			</button>
		</Sheet>
	);
}

function PerksTab({ snap, token }: { snap: Snapshot; token: string }) {
	const [picked, setPicked] = useState<Perk | null>(null);
	return (
		<>
			<p class="lede small">Buy a perk and it gets announced on the big screen. No refunds, no mercy.</p>
			<div class="list">
				{snap.perks.map(p => (
					<button key={p.id} class="item perk" onClick={() => setPicked(p)}>
						<div class="item-body">
							<strong>{p.name}</strong>
							{p.needsTarget && <span class="sub">Pick a victim</span>}
							{p.effect === 'skipQueue' && <span class="sub">Your queued drink jumps to the front</span>}
						</div>
						<div class="price">
							<Money n={p.price} />
						</div>
					</button>
				))}
			</div>
			<h2 class="section">Recent</h2>
			<Feed items={snap.feed.filter(f => f.kind === 'perk').slice(0, 10)} empty="Nobody has bought a perk yet." />
			{picked && <PerkSheet perk={picked} snap={snap} token={token} onClose={() => setPicked(null)} />}
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
			<h2>{perk.name}</h2>
			{perk.effect === 'skipQueue' && <p class="sub">Moves the drink you have waiting in line to the front of Inês's queue. Order the drink first.</p>}
			{perk.needsTarget && (
				<label>
					Who?
					<select value={target} onChange={e => setTarget(e.currentTarget.value)}>
						<option value="">Choose someone…</option>
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
					Left after: <Money n={after} />
				</span>
			</div>
			<button
				class="primary"
				disabled={busy || after < 0 || (perk.needsTarget && !target)}
				onClick={async () => {
					setBusy(true);
					const ok = await act(token, { type: 'buyPerk', perkId: perk.id, target }, 'Done. It is on the big screen.');
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
		if (await act(token, { type: 'transfer', to, amount: Number(amount), note }, 'Sent!')) {
			setAmount('');
			setNote('');
		}
	};
	return (
		<>
			<section class="card">
				<h3>Earn more</h3>
				<p class="sub">
					Payday: +{snap.settings.paydayAmount} Ê$ every hour
					{snap.settings.paydayHours.length ? ` (${[...snap.settings.paydayHours].sort((a, b) => ((a + 12) % 24) - ((b + 12) % 24)).map(h => `${h}h`).join(', ')})` : ''}.
					Win quizzes, karaoke and games. Bring candy or cigarettes to the bank to swap them for coins.
				</p>
			</section>
			<form class="card" onSubmit={send}>
				<h3>Send coins</h3>
				<p class="sub">Settle a bet, pay a friend back, buy someone a drink.</p>
				<label>
					To
					<select value={to} onChange={e => setTo(e.currentTarget.value)} required>
						<option value="">Choose someone…</option>
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
						<input value={note} onInput={e => setNote(e.currentTarget.value)} maxLength={60} placeholder="lost the bet" />
					</label>
				</div>
				<button class="primary" disabled={!to || !amount}>
					Send
				</button>
			</form>
			<section class="card">
				<h3>History</h3>
				{(snap.myTx ?? []).length === 0 && <p class="sub">Nothing yet.</p>}
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
					if (confirm('Log out? You will need your name and PIN to get back in.')) onLogout();
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
				<h3>💰 Richest right now</h3>
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
				<h3>🏆 Top winners</h3>
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
					<h2 class="section">What's happening</h2>
					<Feed items={snap.feed} empty="Quiet so far." />
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
					<span>{f.text}</span>
					<time>{ago(f.ts, now)}</time>
				</li>
			))}
		</ul>
	);
}
