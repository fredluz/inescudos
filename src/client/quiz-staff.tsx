import { useState } from 'preact/hooks';
import type { MediaType, QuestionKind, Quiz, QuizQuestion, Snapshot } from '../shared';
import { act, Money, serverNow, toast, useNow } from './lib';
import { Sheet } from './guest';
import { SHAPES } from './quiz';

type P = { snap: Snapshot; token: string };

export function QuizTab({ snap, token }: P) {
	const [editing, setEditing] = useState<Quiz | null>(null);
	const [sheet, setSheet] = useState<{ title: string; json: string; importing: boolean } | null>(null);
	const quizzes = snap.quizzes ?? [];
	const running = snap.quiz && snap.quiz.phase !== 'final';

	if (editing) return <QuizEditor init={editing} token={token} onDone={() => setEditing(null)} />;

	return (
		<div class="qz-staff">
			{snap.quiz && <LivePanel snap={snap} token={token} />}

			<h3>Quizzes</h3>
			{quizzes.length === 0 && <p class="lede">No quizzes yet.</p>}
			{quizzes.map(q => (
				<div key={q.id} class="card qz-lib">
					<div class="row">
						<strong class="grow">{q.title}</strong>
						<span class="sub">
							{q.questions.length} questions · {q.reward} Ê$ each
						</span>
					</div>
					<div class="row">
						<button class="primary small grow" disabled={!!running} onClick={() => act(token, { type: 'quizStart', quizId: q.id })}>
							Start
						</button>
						<button class="ghost small" onClick={() => setEditing(q)}>
							Edit
						</button>
						<button class="ghost small" onClick={() => setSheet({ title: `Export · ${q.title}`, json: JSON.stringify(q, null, 2), importing: false })}>
							Export
						</button>
						<button
							class="ghost small danger"
							onClick={() => confirm(`Delete the ${q.title} quiz?`) && act(token, { type: 'deleteQuiz', quizId: q.id }, 'Quiz deleted')}
						>
							Delete
						</button>
					</div>
				</div>
			))}
			<div class="row">
				<button class="ghost grow" onClick={() => setEditing({ id: '', title: '', category: '', reward: 5, questions: [blankQuestion()] })}>
					+ New quiz
				</button>
				<button class="ghost grow" onClick={() => setSheet({ title: 'Import quizzes', json: '', importing: true })}>
					Import
				</button>
			</div>

			{sheet && (
				<Sheet onClose={() => setSheet(null)}>
					<h3>{sheet.title}</h3>
					<div class="staff-form">
						<textarea
							class="qz-json"
							value={sheet.json}
							readOnly={!sheet.importing}
							placeholder="Paste a quiz, or a list of quizzes, as JSON"
							onInput={e => setSheet({ ...sheet, json: e.currentTarget.value })}
						/>
						{sheet.importing ? (
							<button
								class="primary"
								onClick={async () => {
									let quizzes: unknown;
									try {
										quizzes = JSON.parse(sheet.json);
									} catch {
										return toast('That isn’t valid JSON', 'error');
									}
									if (await act(token, { type: 'importQuizzes', quizzes }, 'Imported')) setSheet(null);
								}}
							>
								Import
							</button>
						) : (
							<button class="primary" onClick={() => navigator.clipboard.writeText(sheet.json).then(() => toast('Copied'), () => toast('Copy failed', 'error'))}>
								Copy
							</button>
						)}
					</div>
				</Sheet>
			)}
		</div>
	);
}

// ---------------- live controls ----------------

function LivePanel({ snap, token }: P) {
	useNow(500);
	const quiz = snap.quiz!;
	const st = snap.quizStaff;
	const q = quiz.question;
	const run = (type: string, extra: Record<string, unknown> = {}) => act(token, { type, ...extra });
	const left = Math.max(0, Math.ceil((quiz.endsAt - serverNow()) / 1000));
	const last = quiz.index + 1 >= quiz.total;

	return (
		<div class="card qz-live">
			<div class="row">
				<strong class="grow">Live · {quiz.title}</strong>
				<span class="pill">{quiz.phase === 'final' ? 'finished' : quiz.phase}</span>
			</div>
			{quiz.index >= 0 && quiz.phase !== 'final' && (
				<p class="sub">
					Question {quiz.index + 1} of {quiz.total}
					{quiz.phase === 'question' && ` · ${left}s left · ${quiz.answered}/${quiz.players} answered`}
				</p>
			)}
			{q && (
				<>
					<p class="qz-prompt">{q.prompt}</p>
					{st && (
						<p>
							Answer: <strong>{st.key}</strong>
						</p>
					)}
					{q.media && <p class="sub qz-url">{q.media.type}: {q.media.url}</p>}
				</>
			)}

			<div class="qz-ctl">
				{quiz.phase === 'lobby' && (
					<button class="primary" onClick={() => run('quizNext')}>
						Start question 1
					</button>
				)}
				{quiz.phase === 'question' && (
					<>
						<button class="primary" onClick={() => run('quizReveal')}>
							Reveal now
						</button>
						<button class="ghost" onClick={() => run('quizExtend', { seconds: 10 })}>
							+10 s
						</button>
						<button class="ghost" onClick={() => run('quizSkip')}>
							Skip (no prizes)
						</button>
					</>
				)}
				{quiz.phase === 'reveal' && (
					<button class="primary" onClick={() => run('quizNext')}>
						{last ? 'Show final results' : 'Next question'}
					</button>
				)}
				{q?.media && q.media.type !== 'image' && (
					<button class="ghost" onClick={() => run('quizReplay')}>
						Replay clip
					</button>
				)}
				{quiz.phase === 'final' ? (
					<button class="primary" onClick={() => run('quizClose')}>
						Close quiz
					</button>
				) : (
					<button class="ghost danger" onClick={() => confirm('End the quiz now?') && run('quizEnd')}>
						End quiz
					</button>
				)}
			</div>

			{st && st.answers.length > 0 && (
				<ul class="list qz-answers">
					{st.answers.map(a => (
						<li key={a.pid} class="row">
							<span class="grow">
								<b>{a.name}</b> · {a.answer}
							</span>
							{a.correct !== undefined && (
								<button
									class={`small ${a.correct ? 'primary' : 'ghost'}`}
									title="Tap to change"
									onClick={() => run('quizMark', { pid: a.pid, correct: !a.correct })}
								>
									{a.correct ? '✓ right' : '✗ wrong'}
								</button>
							)}
						</li>
					))}
				</ul>
			)}
			{quiz.phase === 'reveal' && <p class="hint">Tap ✓/✗ to fix a mark. Prizes follow the marks.</p>}

			{quiz.phase === 'final' && (
				<ol class="list">
					{quiz.board.map(r => (
						<li key={r.name} class="row">
							<span class="grow">{r.name}</span>
							<span>{r.correct} right</span>
							<Money n={r.won} />
						</li>
					))}
				</ol>
			)}
		</div>
	);
}

// ---------------- editor ----------------

interface QDraft {
	key: string;
	id: string;
	kind: QuestionKind;
	prompt: string;
	options: string[];
	correct: number;
	answers: string;
	value: string;
	mediaType: MediaType;
	mediaUrl: string;
	mediaStart: string;
	mediaEnd: string;
	seconds: string;
}

let keyN = 0;
const newKey = () => `q${++keyN}`;

function blankQuestion(): QuizQuestion {
	return { id: '', kind: 'choice', prompt: '', options: ['', '', '', ''], correct: 0, answers: [], value: 0, media: null, seconds: 20 };
}

const toDraft = (q: QuizQuestion): QDraft => ({
	key: newKey(),
	id: q.id,
	kind: q.kind,
	prompt: q.prompt,
	options: q.kind === 'choice' ? [...q.options] : ['', '', '', ''],
	correct: q.correct,
	answers: q.answers.join('\n'),
	value: q.kind === 'number' ? String(q.value) : '',
	mediaType: q.media?.type ?? 'image',
	mediaUrl: q.media?.url ?? '',
	mediaStart: q.media?.start != null ? String(q.media.start) : '',
	mediaEnd: q.media?.end != null ? String(q.media.end) : '',
	seconds: String(q.seconds),
});

/** Shapes the draft for the server, which does the real validation. */
function fromDraft(d: QDraft) {
	const filled = d.options.map(o => o.trim());
	const options = filled.filter(Boolean);
	return {
		id: d.id,
		kind: d.kind,
		prompt: d.prompt,
		options,
		// keep the tick on the same option text after blank options are dropped
		correct: Math.max(0, options.indexOf(filled[d.correct] ?? '')),
		answers: d.answers.split('\n'),
		value: d.value,
		media: d.mediaUrl.trim() ? { type: d.mediaType, url: d.mediaUrl.trim(), start: d.mediaStart, end: d.mediaEnd } : null,
		seconds: d.seconds,
	};
}

const KIND_LABEL: Record<QuestionKind, string> = { choice: 'Multiple choice', text: 'Type the answer', number: 'Closest number' };

function QuizEditor({ init, token, onDone }: { init: Quiz; token: string; onDone: () => void }) {
	const [title, setTitle] = useState(init.title);
	const [category, setCategory] = useState(init.category);
	const [reward, setReward] = useState(String(init.reward));
	const [qs, setQs] = useState<QDraft[]>(() => init.questions.map(toDraft));
	const [open, setOpen] = useState<string | null>(init.id ? null : (qs[0]?.key ?? null));
	const [busy, setBusy] = useState(false);

	const up = (i: number, patch: Partial<QDraft>) => setQs(qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));
	const moveQ = (i: number, d: number) => {
		const j = i + d;
		if (j < 0 || j >= qs.length) return;
		const c = [...qs];
		[c[i], c[j]] = [c[j]!, c[i]!];
		setQs(c);
	};
	const add = () => {
		const d = toDraft(blankQuestion());
		setQs([...qs, d]);
		setOpen(d.key);
	};
	const save = async () => {
		setBusy(true);
		const quiz = { id: init.id, title, category, reward, questions: qs.map(fromDraft) };
		const ok = await act(token, { type: 'saveQuiz', quiz }, 'Quiz saved');
		setBusy(false);
		if (ok) onDone();
	};

	return (
		<div class="qz-staff qz-editor">
			<div class="card staff-form">
				<h3>{init.id ? 'Edit quiz' : 'New quiz'}</h3>
				<label>
					Title
					<input value={title} maxLength={60} onInput={e => setTitle(e.currentTarget.value)} />
				</label>
				<div class="row">
					<label class="grow">
						Category
						<input value={category} maxLength={30} onInput={e => setCategory(e.currentTarget.value)} />
					</label>
					<label>
						Ê$ per right answer
						<input inputMode="numeric" value={reward} onInput={e => setReward(e.currentTarget.value)} />
					</label>
				</div>
			</div>

			{qs.map((q, i) => {
				const isOpen = open === q.key;
				return (
					<div key={q.key} class={`card qz-q ${isOpen ? 'open' : ''}`}>
						<button class="qz-q-head" onClick={() => setOpen(isOpen ? null : q.key)}>
							<b>{i + 1}</b>
							<span class="grow">{q.prompt || 'New question'}</span>
							<small>
								{KIND_LABEL[q.kind]}
								{q.mediaUrl ? ` · ${q.mediaType}` : ''}
							</small>
						</button>
						{isOpen && (
							<div class="staff-form">
								<div class="row">
									<select value={q.kind} onChange={e => up(i, { kind: e.currentTarget.value as QuestionKind })}>
										{(Object.keys(KIND_LABEL) as QuestionKind[]).map(k => (
											<option key={k} value={k}>
												{KIND_LABEL[k]}
											</option>
										))}
									</select>
									<label class="qz-secs">
										Seconds
										<input inputMode="numeric" value={q.seconds} onInput={e => up(i, { seconds: e.currentTarget.value })} />
									</label>
								</div>
								<label>
									Question (shown on the TV)
									<textarea rows={2} value={q.prompt} onInput={e => up(i, { prompt: e.currentTarget.value })} />
								</label>

								{q.kind === 'choice' &&
									q.options.map((o, k) => (
										<div key={k} class="row qz-optrow">
											<label class="check" title="Correct answer">
												<input type="radio" name={`correct-${q.key}`} checked={q.correct === k} onChange={() => up(i, { correct: k })} />
												<i class={`qz-shape c${k}`}>{SHAPES[k]}</i>
											</label>
											<input
												class="grow"
												placeholder={k < 2 ? `Option ${k + 1}` : `Option ${k + 1} (optional)`}
												value={o}
												maxLength={80}
												onInput={e => up(i, { options: q.options.map((x, j) => (j === k ? e.currentTarget.value : x)) })}
											/>
										</div>
									))}
								{q.kind === 'choice' && <p class="hint">Tick the right option. Leave options blank to use fewer.</p>}
								{q.kind === 'text' && (
									<label>
										Accepted answers, one per line (the first is shown at the reveal)
										<textarea rows={3} value={q.answers} onInput={e => up(i, { answers: e.currentTarget.value })} />
									</label>
								)}
								{q.kind === 'number' && (
									<label>
										Right answer (closest guess wins)
										<input inputMode="decimal" value={q.value} onInput={e => up(i, { value: e.currentTarget.value })} />
									</label>
								)}

								<label>
									Picture, video or sound (optional)
									<div class="row">
										<select class="qz-mtype" value={q.mediaType} onChange={e => up(i, { mediaType: e.currentTarget.value as MediaType })}>
											<option value="image">Picture</option>
											<option value="video">Video</option>
											<option value="audio">Sound only</option>
										</select>
										<input
											class="grow"
											placeholder="https://… or YouTube link"
											value={q.mediaUrl}
											onInput={e => up(i, { mediaUrl: e.currentTarget.value })}
										/>
									</div>
								</label>
								{q.mediaUrl && q.mediaType !== 'image' && (
									<div class="row">
										<label class="grow">
											Start at (s)
											<input inputMode="decimal" value={q.mediaStart} onInput={e => up(i, { mediaStart: e.currentTarget.value })} />
										</label>
										<label class="grow">
											Stop at (s)
											<input inputMode="decimal" value={q.mediaEnd} onInput={e => up(i, { mediaEnd: e.currentTarget.value })} />
										</label>
									</div>
								)}
								{q.mediaUrl && q.mediaType === 'audio' && <p class="hint">Sound only hides the video on the TV, so YouTube links work for name-the-song.</p>}

								<div class="row">
									<button class="ghost small" onClick={() => moveQ(i, -1)}>
										↑
									</button>
									<button class="ghost small" onClick={() => moveQ(i, 1)}>
										↓
									</button>
									<button
										class="ghost small"
										onClick={() => {
											const copy = { ...q, key: newKey(), id: '' };
											setQs([...qs.slice(0, i + 1), copy, ...qs.slice(i + 1)]);
											setOpen(copy.key);
										}}
									>
										Duplicate
									</button>
									<span class="grow" />
									<button class="ghost small danger" onClick={() => setQs(qs.filter((_, j) => j !== i))}>
										Delete
									</button>
								</div>
							</div>
						)}
					</div>
				);
			})}

			<button class="ghost qz-add" onClick={add}>
				+ Add question
			</button>
			<div class="row qz-save">
				<button class="ghost" onClick={() => (confirm('Discard changes?') ? onDone() : undefined)}>
					Cancel
				</button>
				<button class="primary grow" disabled={busy || !qs.length} onClick={save}>
					Save quiz
				</button>
			</div>
		</div>
	);
}
