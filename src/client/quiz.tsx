import { useEffect, useRef, useState } from 'preact/hooks';
import type { QuizMedia, QuizView } from '../shared';
import { act, chime, Money, serverNow, useNow } from './lib';

export const SHAPES = ['▲', '◆', '●', '■'];

function secondsLeft(quiz: QuizView): number {
	return Math.max(0, Math.ceil((quiz.endsAt - serverNow()) / 1000));
}

function youTubeId(url: string): string | null {
	return /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/.exec(url)?.[1] ?? null;
}

/** TV-side player for a question's picture, video or sound clip. The caller remounts it to replay. */
function Media({ media }: { media: QuizMedia }) {
	const ref = useRef<HTMLVideoElement & HTMLAudioElement>(null);
	const [blocked, setBlocked] = useState(false);
	const yt = media.type === 'image' ? null : youTubeId(media.url);

	useEffect(() => {
		if (yt || media.type === 'image') return;
		ref.current?.play().catch(() => setBlocked(true));
	}, []);

	if (media.type === 'image') return <img class="qz-media" src={media.url} alt="" />;

	if (yt) {
		const params = new URLSearchParams({ autoplay: '1', controls: '0', rel: '0', playsinline: '1' });
		if (media.start != null) params.set('start', String(Math.floor(media.start)));
		if (media.end != null) params.set('end', String(Math.ceil(media.end)));
		return (
			<div class={`qz-yt ${media.type}`}>
				<iframe src={`https://www.youtube-nocookie.com/embed/${yt}?${params}`} allow="autoplay; encrypted-media" title="Question clip" />
				{media.type === 'audio' && (
					<div class="qz-cover">
						<div class="qz-listen">♪</div>
					</div>
				)}
			</div>
		);
	}

	const fragment = media.start != null || media.end != null ? `#t=${media.start ?? 0}${media.end != null ? `,${media.end}` : ''}` : '';
	const stopAtEnd = () => {
		const el = ref.current;
		if (el && media.end != null && el.currentTime >= media.end) el.pause();
	};
	const retry = () => ref.current?.play().then(() => setBlocked(false), () => {});
	return (
		<div class="qz-clip">
			{media.type === 'video' ? (
				<video ref={ref} class="qz-media" src={media.url + fragment} playsInline onTimeUpdate={stopAtEnd} />
			) : (
				<>
					<div class="qz-listen">♪</div>
					<audio ref={ref} src={media.url + fragment} onTimeUpdate={stopAtEnd} />
				</>
			)}
			{blocked && (
				<button class="qz-play" onClick={retry}>
					▶ Play
				</button>
			)}
		</div>
	);
}

function Board({ quiz, limit }: { quiz: QuizView; limit: number }) {
	if (!quiz.board.length) return <p class="qz-muted">Nobody has scored yet.</p>;
	return (
		<ol class="qz-board">
			{quiz.board.slice(0, limit).map((r, i) => (
				<li key={r.name}>
					<b>{i + 1}</b>
					<span>{r.name}</span>
					<em>{r.correct} right</em>
					<Money n={r.won} />
				</li>
			))}
		</ol>
	);
}

// ---------------- TV ----------------

export function TvQuiz({ quiz, sound }: { quiz: QuizView; sound: boolean }) {
	useNow(250);
	const stage = `${quiz.phase}-${quiz.index}`;
	useEffect(() => {
		if (sound && quiz.phase === 'question' && !quiz.question?.media) chime(1);
	}, [stage]);

	const q = quiz.question;
	const reveal = quiz.reveal;
	return (
		<div class={`qz-tv ${quiz.phase}`}>
			<header>
				<span class="qz-title">{quiz.title}</span>
				{quiz.index >= 0 && quiz.phase !== 'final' && (
					<span class="qz-count">
						Question {quiz.index + 1} of {quiz.total}
					</span>
				)}
				{quiz.phase === 'question' && <span class="qz-timer">{secondsLeft(quiz)}</span>}
			</header>

			{quiz.phase === 'lobby' && (
				<main class="qz-lobby">
					<p class="qz-kicker">Quiz time</p>
					<h1>{quiz.title}</h1>
					<p>
						{quiz.total} questions · every right answer pays <Money n={quiz.reward} />
					</p>
					<p class="qz-muted">Questions show up here. Answer on your phone.</p>
				</main>
			)}

			{q && (
				<main class="qz-question">
					<h1>{q.prompt}</h1>
					{q.media && (quiz.phase === 'question' || q.media.type === 'image') && (
						<div class="qz-stage" key={`${q.id}-${quiz.playCount}`}>
							<Media media={q.media} />
						</div>
					)}
					{q.kind === 'choice' ? (
						<div class={`qz-options n${q.options.length}`}>
							{q.options.map((o, i) => (
								<div
									key={i}
									class={`qz-opt c${i}${reveal ? (reveal.correct === i ? ' right' : ' wrong') : ''}`}
								>
									<i>{SHAPES[i]}</i>
									<span>{o}</span>
									{reveal && <b>{reveal.counts[i]}</b>}
								</div>
							))}
						</div>
					) : (
						!reveal && <p class="qz-hint">{q.kind === 'number' ? 'Closest guess wins. Type a number on your phone.' : 'Type your answer on your phone.'}</p>
					)}
					{reveal && (
						<div class="qz-reveal">
							<p class="qz-answer">{reveal.answer}</p>
							<p>
								{reveal.winners.length
									? `${reveal.winners.join(', ')} ${reveal.winners.length === 1 ? 'gets' : 'get'} +${quiz.reward} Ê$`
									: 'Nobody got it'}
							</p>
						</div>
					)}
					{quiz.phase === 'question' && (
						<p class="qz-muted">
							{quiz.answered} of {quiz.players} answered
						</p>
					)}
				</main>
			)}

			{reveal && (
				<aside class="qz-side">
					<h2>Scores</h2>
					<Board quiz={quiz} limit={6} />
				</aside>
			)}

			{quiz.phase === 'final' && (
				<main class="qz-final">
					<p class="qz-kicker">Final results</p>
					<h1>{quiz.board[0] ? `${quiz.board[0].name} wins` : 'Nobody scored'}</h1>
					<Board quiz={quiz} limit={10} />
				</main>
			)}
		</div>
	);
}

// ---------------- phone ----------------

export function GuestQuiz({ quiz, token }: { quiz: QuizView; token: string }) {
	useNow(500);
	const stage = `${quiz.phase}-${quiz.index}`;
	const [hidden, setHidden] = useState<string | null>(null);
	const [typed, setTyped] = useState('');
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		setTyped('');
		if (quiz.phase === 'question') {
			setHidden(null);
			navigator.vibrate?.(120);
		}
	}, [stage]);

	if (hidden === stage)
		return (
			<button class="qz-reopen" onClick={() => setHidden(null)}>
				Quiz · {quiz.phase === 'question' ? `${secondsLeft(quiz)}s left` : 'open'}
			</button>
		);

	const mine = quiz.mine;
	const q = quiz.question;
	const timeUp = quiz.phase === 'question' && secondsLeft(quiz) === 0;
	const send = async (answer: number | string) => {
		setBusy(true);
		await act(token, { type: 'quizAnswer', answer });
		setBusy(false);
	};

	let body;
	if (quiz.phase === 'lobby') {
		body = (
			<>
				<h2>{quiz.title}</h2>
				<p>Eyes on the TV. Questions show up there, you answer here.</p>
				<p class="qz-muted">
					Every right answer pays <Money n={quiz.reward} />
				</p>
			</>
		);
	} else if (quiz.phase === 'question' && q && !mine?.answer && !timeUp) {
		body =
			q.kind === 'choice' ? (
				<div class={`qz-pad n${q.options.length}`}>
					{q.options.map((o, i) => (
						<button key={i} class={`qz-opt c${i}`} disabled={busy} onClick={() => send(i)}>
							<i>{SHAPES[i]}</i>
							<span>{o}</span>
						</button>
					))}
				</div>
			) : (
				<form
					class="qz-type"
					onSubmit={e => {
						e.preventDefault();
						if (typed.trim()) void send(typed.trim());
					}}
				>
					<input
						value={typed}
						onInput={e => setTyped(e.currentTarget.value)}
						inputMode={q.kind === 'number' ? 'decimal' : 'text'}
						enterKeyHint="send"
						autoComplete="off"
						autoCapitalize="off"
						placeholder={q.kind === 'number' ? 'Your guess' : 'Your answer'}
						maxLength={80}
					/>
					<button class="primary" disabled={busy || !typed.trim()}>
						Send
					</button>
				</form>
			);
	} else if (quiz.phase === 'question') {
		body = mine?.answer ? (
			<>
				<h2>Locked in</h2>
				<p class="qz-mine">{mine.answer}</p>
				<p class="qz-muted">Wait for the reveal.</p>
			</>
		) : (
			<h2>Time’s up</h2>
		);
	} else if (quiz.phase === 'reveal') {
		body = (
			<>
				<h2>{mine?.correct ? `Right! +${quiz.reward} Ê$` : mine?.answer ? 'Not this time' : 'No answer'}</h2>
				{!mine?.correct && <p>Answer: {quiz.reveal?.answer}</p>}
				<p class="qz-muted">You have {mine?.score ?? 0} right so far.</p>
			</>
		);
	} else {
		const rank = quiz.board.findIndex(r => r.correct === mine?.score) + 1;
		body = (
			<>
				<h2>Quiz over</h2>
				<p>
					You got {mine?.score ?? 0} right
					{mine?.score ? (
						<>
							{' '}
							· <Money n={(mine.score ?? 0) * quiz.reward} /> won · #{rank}
						</>
					) : null}
				</p>
			</>
		);
	}

	return (
		<div class={`qz-phone ${quiz.phase}`}>
			<header>
				<span>
					{quiz.title}
					{quiz.index >= 0 && quiz.phase !== 'final' && ` · ${quiz.index + 1}/${quiz.total}`}
				</span>
				{quiz.phase === 'question' && <b class="qz-timer">{secondsLeft(quiz)}</b>}
				<button class="ghost small" onClick={() => setHidden(stage)}>
					Hide
				</button>
			</header>
			<main>{body}</main>
		</div>
	);
}
