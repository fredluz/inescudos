import qrcode from 'qrcode-generator';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { FeedItem, PublicPlayer } from '../shared';
import { chime, clock, countdown, Money, unlockAudio, useNow, useSnapshot } from './lib';

const ANNOUNCE: FeedItem['kind'][] = ['perk', 'payday', 'prize'];
/** Server feed texts always start with "<emoji> "; split it off to show it large. */
const splitIcon = (text: string) => {
	const i = text.indexOf(' ');
	return { icon: text.slice(0, i), body: text.slice(i + 1) };
};

function Rank({ title, players, field }: { title: string; players: PublicPlayer[]; field: 'balance' | 'earned' }) {
	const list = players
		.filter(p => field === 'balance' || p.earned > 0)
		.sort((a, b) => b[field] - a[field])
		.slice(0, 7);
	return (
		<section class="tv-box">
			<h2>{title}</h2>
			{list.length === 0 && <p class="tv-empty">No prizes yet. Win a quiz!</p>}
			<ol>
				{list.map((p, i) => (
					<li key={p.id}>
						<b>{i + 1}</b>
						<span class="nm">{p.name}</span>
						<Money n={p[field]} />
					</li>
				))}
			</ol>
		</section>
	);
}

export function Tv() {
	const { snap, online } = useSnapshot(null);
	const now = useNow();
	const [sound, setSound] = useState(false);
	const [shown, setShown] = useState<FeedItem | null>(null);
	const seen = useRef<Set<string> | null>(null);
	const pending = useRef<FeedItem[]>([]);
	const busy = useRef(false);

	const qrSvg = useMemo(() => {
		const qr = qrcode(0, 'M');
		qr.addData(location.origin);
		qr.make();
		return qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
	}, []);

	useEffect(() => {
		const click = () => {
			unlockAudio();
			setSound(true);
		};
		addEventListener('click', click);
		return () => removeEventListener('click', click);
	}, []);

	const next = () => {
		const item = pending.current.shift();
		if (!item) {
			busy.current = false;
			setShown(null);
			return;
		}
		busy.current = true;
		setShown(item);
		chime(2);
		setTimeout(() => {
			setShown(null);
			setTimeout(next, 400);
		}, 6000);
	};

	useEffect(() => {
		if (!snap) return;
		const ids = new Set(snap.feed.map((f) => f.id));
		if (seen.current) {
			const fresh = snap.feed
				.filter((f) => !seen.current!.has(f.id) && ANNOUNCE.includes(f.kind))
				.sort((a, b) => a.ts - b.ts);
			if (fresh.length) {
				pending.current.push(...fresh);
				if (!busy.current) next();
			}
		}
		seen.current = ids;
	}, [snap]);

	if (!snap) return <div class="tv"><div class="tv-loading">Inêscudos…</div></div>;

	const ready = snap.queue.filter((q) => q.status === 'ready');
	const making = snap.queue.filter((q) => q.status === 'making');
	const queued = snap.queue.filter((q) => q.status === 'queued');
	const feed = [...snap.feed].sort((a, b) => b.ts - a.ts).slice(0, 9);

	return (
		<div class="tv">
			<header>
				<div class="script">Inêscudos</div>
				<div class={'bar-status ' + (snap.settings.barOpen ? 'open' : 'closed')}>
					Bar {snap.settings.barOpen ? 'open' : 'closed'}
				</div>
				<div class="clock">{clock(now)}</div>
				{snap.nextPayday != null && (
					<div class="payday">
						<span>Payday in</span>
						<b>{countdown(snap.nextPayday, now)}</b>
						<em>+{snap.settings.paydayAmount} Ê$</em>
					</div>
				)}
			</header>

			<main>
				<div class="col">
					<Rank title="Richest" players={snap.players} field="balance" />
					<Rank title="Top winners" players={snap.players} field="earned" />
				</div>

				<div class="col">
					<section class="tv-box ready">
						<h2>Ready — come grab it</h2>
						{ready.length === 0 && <p class="none">Nothing waiting</p>}
						<ul>
							{ready.slice(0, 5).map((q) => (
								<li key={q.id}>
									<b>{q.pname}</b> <span>{q.itemName}</span>
								</li>
							))}
						</ul>
					</section>
					<section class="tv-box">
						<h2>Being made</h2>
						{making.length === 0 && <p class="none">—</p>}
						<ul class="small">
							{making.slice(0, 3).map((q) => (
								<li key={q.id}>
									<b>{q.pname}</b> <span>{q.itemName}</span>
								</li>
							))}
						</ul>
					</section>
					<section class="tv-box grow">
						<h2>In line ({queued.length})</h2>
						{queued.length === 0 && <p class="none">Queue is empty</p>}
						<ul class="small">
							{queued.slice(0, 8).map((q) => (
								<li key={q.id}>
									{q.priority && '⚡ '}
									<b>{q.pname}</b> <span>{q.itemName}</span>
								</li>
							))}
						</ul>
						{queued.length > 8 && <p class="more">+{queued.length - 8} more</p>}
					</section>
				</div>

				<div class="col">
					<section class="tv-box grow">
						<h2>What's happening</h2>
						<ul class="feed">
							{feed.map((f) => (
								<li key={f.id} class={f.kind}>
									<span>{f.text}</span>
									<time>{clock(f.ts)}</time>
								</li>
							))}
						</ul>
					</section>
				</div>
			</main>

			<footer>
				<div class="qr" dangerouslySetInnerHTML={{ __html: qrSvg }} />
				<div>Scan to join · {location.host}</div>
				{!sound && <small>click to enable sound</small>}
			</footer>

			{!online && <div class="offline-badge">Reconnecting…</div>}

			{shown && (
				<div class="announce" key={shown.id}>
					<div class={'card ' + shown.kind}>
						<i>{splitIcon(shown.text).icon}</i>
						<p>{splitIcon(shown.text).body}</p>
					</div>
				</div>
			)}
		</div>
	);
}
