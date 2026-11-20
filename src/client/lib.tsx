import { useEffect, useState } from 'preact/hooks';
import type { FeedItem, Snapshot } from '../shared';

export const GUEST_KEY = 'inescudos.token';
export const STAFF_KEY = 'inescudos.staff';

export async function post<T = { ok: true }>(path: string, body: unknown, token?: string | null): Promise<T> {
	let res: Response;
	try {
		res = await fetch(path, {
			method: 'POST',
			headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
			body: JSON.stringify(body),
		});
	} catch {
		throw new Error('No connection. Try again.');
	}
	const data = (await res.json().catch(() => ({}))) as { error?: string };
	if (!res.ok || data.error) throw new Error(data.error ?? `Error ${res.status}`);
	return data as T;
}

/** Runs a staff/guest action and surfaces failures as a toast. Returns true on success. */
export async function act(token: string | null, body: Record<string, unknown>, success?: string): Promise<boolean> {
	try {
		await post('/api/act', body, token);
		if (success) toast(success);
		return true;
	} catch (e) {
		toast((e as Error).message, 'error');
		return false;
	}
}

export function useStored(key: string): [string | null, (v: string | null) => void] {
	const [value, setValue] = useState(() => localStorage.getItem(key));
	return [
		value,
		v => {
			if (v == null) localStorage.removeItem(key);
			else localStorage.setItem(key, v);
			setValue(v);
		},
	];
}

/** Live party state over a WebSocket; reconnects on drop and when the phone wakes up. */
export function useSnapshot(token: string | null): { snap: Snapshot | null; online: boolean } {
	const [snap, setSnap] = useState<Snapshot | null>(null);
	const [online, setOnline] = useState(false);
	useEffect(() => {
		let ws: WebSocket | null = null;
		let disposed = false;
		let retry = 0;
		let timer: number | undefined;
		const connect = () => {
			clearTimeout(timer);
			const proto = location.protocol === 'https:' ? 'wss' : 'ws';
			const sock = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(token ?? '')}`);
			ws = sock;
			sock.onopen = () => {
				retry = 0;
				setOnline(true);
			};
			sock.onmessage = e => {
				if (e.data !== 'pong') setSnap(JSON.parse(e.data as string) as Snapshot);
			};
			sock.onclose = () => {
				if (sock !== ws || disposed) return;
				setOnline(false);
				timer = setTimeout(connect, Math.min(5000, 400 * 2 ** retry++));
			};
			sock.onerror = () => sock.close();
		};
		connect();
		const ping = setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send('ping'), 20_000);
		const wake = () => {
			if (document.visibilityState === 'visible' && ws && ws.readyState !== WebSocket.OPEN) connect();
		};
		document.addEventListener('visibilitychange', wake);
		return () => {
			disposed = true;
			clearTimeout(timer);
			clearInterval(ping);
			document.removeEventListener('visibilitychange', wake);
			ws?.close();
		};
	}, [token]);
	return { snap, online };
}

export function useNow(intervalMs = 1000): number {
	const [now, setNow] = useState(Date.now());
	useEffect(() => {
		const t = setInterval(() => setNow(Date.now()), intervalMs);
		return () => clearInterval(t);
	}, [intervalMs]);
	return now;
}

export function Money({ n, big }: { n: number; big?: boolean }) {
	return (
		<span class={big ? 'money big' : 'money'}>
			{n}
			<small> Ê$</small>
		</span>
	);
}

export const clock = (ts: number) =>
	new Date(ts).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Lisbon' });

export function countdown(target: number, now: number): string {
	const s = Math.max(0, Math.round((target - now) / 1000));
	const m = Math.floor(s / 60);
	return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function ago(ts: number, now: number): string {
	const m = Math.floor((now - ts) / 60_000);
	return m < 1 ? 'just now' : `${m} min ago`;
}

// ---- toasts ----

type Toast = { id: number; text: string; kind: 'ok' | 'error' };
let toastId = 0;
const listeners = new Set<(t: Toast) => void>();

export function toast(text: string, kind: Toast['kind'] = 'ok'): void {
	const t = { id: ++toastId, text, kind };
	for (const l of listeners) l(t);
}

export function Toasts() {
	const [list, setList] = useState<Toast[]>([]);
	useEffect(() => {
		const add = (t: Toast) => {
			setList(l => [...l, t]);
			setTimeout(() => setList(l => l.filter(x => x.id !== t.id)), t.kind === 'error' ? 4500 : 3000);
		};
		listeners.add(add);
		return () => listeners.delete(add);
	}, []);
	return (
		<div class="toasts">
			{list.map(t => (
				<div key={t.id} class={`toast ${t.kind}`}>
					{t.text}
				</div>
			))}
		</div>
	);
}

// ---- sound ----

let audio: AudioContext | null = null;

/** Must first be called from a user gesture on iOS; later calls then work from socket events. */
export function chime(times = 2): void {
	try {
		audio ??= new AudioContext();
		void audio.resume();
		const t0 = audio.currentTime;
		for (let i = 0; i < times; i++) {
			const osc = audio.createOscillator();
			const gain = audio.createGain();
			osc.frequency.value = i % 2 ? 1046 : 784;
			gain.gain.setValueAtTime(0.0001, t0 + i * 0.18);
			gain.gain.exponentialRampToValueAtTime(0.3, t0 + i * 0.18 + 0.02);
			gain.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.18 + 0.16);
			osc.connect(gain).connect(audio.destination);
			osc.start(t0 + i * 0.18);
			osc.stop(t0 + i * 0.18 + 0.17);
		}
	} catch {}
}

export function unlockAudio(): void {
	try {
		audio ??= new AudioContext();
		void audio.resume();
	} catch {}
}

export function Illustration({ name, className = '' }: { name: string; className?: string }) {
	return <img class={`illustration ${className}`} src={`/illustrations/${name}.webp`} alt="" />;
}

export function Thumb({ img, fallback = 'dry-martini', size = 68 }: { img?: string; fallback?: string; size?: number }) {
	return (
		<img class="thumb" src={img?.startsWith('/illustrations/') ? img : `/illustrations/${fallback}.webp`}
			alt="" width={size} height={size} loading="lazy" />
	);
}

const feedArt: Record<FeedItem['kind'], string> = {
	ready: 'dry-martini', perk: 'menu-pianist', prize: 'coins',
	payday: 'coins', transfer: 'coins', info: 'other-savouries',
};

export function FeedArt({ kind }: { kind: FeedItem['kind'] }) {
	return <Illustration name={feedArt[kind]} className="feed-art" />;
}

export function feedText(text: string) {
	// Existing events may have a pictograph prefix from the original feed.
	return text.replace(/^\p{Extended_Pictographic}\uFE0F? /u, '');
}
