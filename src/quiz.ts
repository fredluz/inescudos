import { HttpError } from './http';
import type { MediaType, QuestionKind, Quiz, QuizMedia, QuizQuestion } from './shared';

const KINDS: QuestionKind[] = ['choice', 'number', 'text'];
const MEDIA: MediaType[] = ['image', 'video', 'audio'];

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === 'object' ? (v as Raw) : {});

function text(v: unknown, label: string, max: number, allowEmpty = false): string {
	const s = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : typeof v === 'number' ? String(v) : '';
	if (!allowEmpty && !s) throw new HttpError(`${label} is required`);
	if (s.length > max) throw new HttpError(`${label} is too long (max ${max})`);
	return s;
}

function whole(v: unknown, label: string, min: number, max: number): number {
	const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
	if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max)
		throw new HttpError(`${label} must be a whole number between ${min} and ${max}`);
	return n;
}

function finite(v: unknown, label: string): number {
	const n = typeof v === 'string' && v.trim() !== '' ? Number(v.replace(',', '.')) : v;
	if (typeof n !== 'number' || !Number.isFinite(n)) throw new HttpError(`${label} must be a number`);
	return n;
}

function cleanMedia(v: unknown, label: string): QuizMedia | null {
	const m = obj(v);
	if (typeof m.url !== 'string' || !m.url.trim()) return null;
	const type = m.type as MediaType;
	if (!MEDIA.includes(type)) throw new HttpError(`${label} media type must be image, video or audio`);
	const url = text(m.url, `${label} media link`, 500);
	if (!/^(https:\/\/|\/)/.test(url)) throw new HttpError(`${label} media link must start with https:// or /`);
	const media: QuizMedia = { type, url };
	if (type !== 'image') {
		const start = m.start === undefined || m.start === null || m.start === '' ? undefined : finite(m.start, `${label} clip start`);
		const end = m.end === undefined || m.end === null || m.end === '' ? undefined : finite(m.end, `${label} clip end`);
		if ((start ?? 0) < 0) throw new HttpError(`${label} clip start can't be negative`);
		if (end !== undefined && end <= (start ?? 0)) throw new HttpError(`${label} clip must end after it starts`);
		if (start !== undefined) media.start = start;
		if (end !== undefined) media.end = end;
	}
	return media;
}

function cleanQuestion(v: unknown, n: number, uid: () => string): QuizQuestion {
	const q = obj(v);
	const label = `Question ${n}`;
	const kind = q.kind as QuestionKind;
	if (!KINDS.includes(kind)) throw new HttpError(`${label} needs a type: choice, number or text`);
	const options = kind === 'choice' ? (Array.isArray(q.options) ? q.options : []).map((o, i) => text(o, `${label} option ${i + 1}`, 80)) : [];
	if (kind === 'choice' && (options.length < 2 || options.length > 4)) throw new HttpError(`${label} needs 2 to 4 options`);
	const answers =
		kind === 'text'
			? (Array.isArray(q.answers) ? q.answers : []).map(a => text(a, `${label} answer`, 80, true)).filter(Boolean)
			: [];
	if (kind === 'text' && (answers.length < 1 || answers.length > 20)) throw new HttpError(`${label} needs 1 to 20 accepted answers`);
	return {
		id: typeof q.id === 'string' && q.id ? q.id.slice(0, 40) : uid(),
		kind,
		prompt: text(q.prompt, label, 300),
		options,
		correct: kind === 'choice' ? whole(q.correct, `${label} correct option`, 0, options.length - 1) : 0,
		answers,
		value: kind === 'number' ? finite(q.value, `${label} answer`) : 0,
		media: cleanMedia(q.media, label),
		seconds: whole(q.seconds ?? 20, `${label} time limit`, 5, 300),
	};
}

export function cleanQuiz(v: unknown, uid: () => string): Quiz {
	const q = obj(v);
	const questions = Array.isArray(q.questions) ? q.questions : [];
	if (!questions.length) throw new HttpError('A quiz needs at least one question');
	if (questions.length > 100) throw new HttpError('A quiz can have at most 100 questions');
	return {
		id: typeof q.id === 'string' && q.id ? q.id.slice(0, 40) : uid(),
		title: text(q.title, 'Quiz title', 60),
		category: text(q.category, 'Category', 30, true),
		reward: whole(q.reward ?? 5, 'Reward', 0, 1000),
		questions: questions.map((x, i) => cleanQuestion(x, i + 1, uid)),
	};
}

/** Turns a submitted answer into the stored value, or throws if it doesn't fit the question. */
export function parseAnswer(q: QuizQuestion, raw: unknown): number | string {
	if (q.kind === 'choice') return whole(raw, 'Answer', 0, q.options.length - 1);
	if (q.kind === 'number') return finite(raw, 'Answer');
	return text(raw, 'Answer', 80);
}

const normalize = (s: string) =>
	s
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.replace(/&/g, ' and ')
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();

/** Exact match ignoring case, accents, punctuation and spacing, or an accepted answer appearing as whole words. */
export function textMatches(input: string, accepted: string[]): boolean {
	const n = normalize(input);
	const padded = ` ${n} `;
	const compact = n.replaceAll(' ', '');
	return accepted.some(a => {
		const x = normalize(a);
		return x !== '' && (compact === x.replaceAll(' ', '') || padded.includes(` ${x} `));
	});
}

/** Who got the question right. Number questions: the closest guess wins, ties included. */
export function judge(q: QuizQuestion, answers: Record<string, { v: number | string }>): Record<string, boolean> {
	const marks: Record<string, boolean> = {};
	const entries = Object.entries(answers);
	if (q.kind === 'number') {
		const dist = (v: number | string) => Math.abs(Number(v) - q.value);
		const best = Math.min(...entries.map(([, a]) => dist(a.v)));
		for (const [pid, a] of entries) marks[pid] = dist(a.v) === best;
		return marks;
	}
	for (const [pid, a] of entries)
		marks[pid] = q.kind === 'choice' ? a.v === q.correct : typeof a.v === 'string' && textMatches(a.v, q.answers);
	return marks;
}

export const showAnswer = (q: QuizQuestion, v: number | string): string =>
	q.kind === 'choice' ? (q.options[Number(v)] ?? '?') : String(v);

export const answerKey = (q: QuizQuestion): string =>
	q.kind === 'choice' ? (q.options[q.correct] ?? '') : q.kind === 'text' ? (q.answers[0] ?? '') : String(q.value);
