export type Serve = 'bar' | 'self';

export interface MenuItem {
	id: string;
	name: string;
	desc: string;
	section: string;
	price: number;
	serve: Serve;
	img: string;
	mocktail?: boolean;
	archived?: boolean;
	available: boolean;
	/** null = unlimited */
	stock: number | null;
}

export type TxKind =
	| 'start'
	| 'payday'
	| 'prize'
	| 'contribution'
	| 'exchange'
	| 'order'
	| 'purchase'
	| 'perk'
	| 'transfer'
	| 'adjust';

export interface Tx {
	id: string;
	group: string;
	ts: number;
	pid: string;
	amt: number;
	kind: TxKind;
	reason: string;
	undone?: boolean;
}

export interface Player {
	id: string;
	name: string;
	pinHash: string;
	joinedAt: number;
	removed?: boolean;
}

export type OrderStatus = 'queued' | 'making' | 'ready' | 'done' | 'cancelled';
export const ACTIVE: OrderStatus[] = ['queued', 'making', 'ready'];

export interface Order {
	id: string;
	ts: number;
	updatedAt: number;
	pid: string;
	itemId: string;
	itemName: string;
	price: number;
	virgin: boolean;
	note: string;
	status: OrderStatus;
	txId: string;
	/** bumped to the front by the "skip the queue" perk */
	priority: boolean;
}

export type PerkEffect = 'none' | 'skipQueue';

export interface Perk {
	id: string;
	name: string;
	price: number;
	needsTarget: boolean;
	/** 'skipQueue' moves the buyer's oldest queued drink to the front; 'none' is announce-only */
	effect: PerkEffect;
}

export interface QuickAction {
	id: string;
	label: string;
	amount: number;
	kind: TxKind;
}

export interface Settings {
	startBalance: number;
	paydayAmount: number;
	/** Lisbon hours (0-23) at which payday fires */
	paydayHours: number[];
	autoPayday: boolean;
	barOpen: boolean;
	maxActiveOrders: number;
}

export interface FeedItem {
	id: string;
	ts: number;
	text: string;
	kind: 'payday' | 'prize' | 'perk' | 'ready' | 'info' | 'transfer';
}

// ---- quizzes ----

/** choice: 2-4 options, one correct; number: closest guess wins; text: typed answer matched against `answers`. */
export type QuestionKind = 'choice' | 'number' | 'text';
export type MediaType = 'image' | 'video' | 'audio';

export interface QuizMedia {
	type: MediaType;
	/** https URL (files or YouTube) or a site path like /quiz/clip.mp3 */
	url: string;
	/** clip window in seconds (video/audio only) */
	start?: number;
	end?: number;
}

export interface QuizQuestion {
	id: string;
	kind: QuestionKind;
	prompt: string;
	/** choice only */
	options: string[];
	correct: number;
	/** text only: accepted answers, the first is the one shown at the reveal */
	answers: string[];
	/** number only */
	value: number;
	media: QuizMedia | null;
	seconds: number;
}

export interface Quiz {
	id: string;
	title: string;
	category: string;
	/** Ê$ paid for each correct answer */
	reward: number;
	questions: QuizQuestion[];
}

export type QuizPhase = 'lobby' | 'question' | 'reveal' | 'final';

export interface QuizGame {
	/** frozen copy, so editing the library mid-game is safe */
	quiz: Quiz;
	phase: QuizPhase;
	/** -1 in the lobby */
	index: number;
	endsAt: number;
	answers: Record<string, { v: number | string; ts: number }>;
	/** reveal: who is marked correct for the current question */
	marks: Record<string, boolean>;
	/** reveal: ledger group of the current question's prizes */
	txGroup: string;
	/** correct answers per player across the game */
	scores: Record<string, number>;
	/** bumped by staff to replay the question's media on the TV */
	playCount: number;
}

export interface QuizBoardRow {
	name: string;
	correct: number;
	won: number;
}

/** What every screen sees of a running quiz. Never contains the answer before the reveal. */
export interface QuizView {
	title: string;
	category: string;
	reward: number;
	phase: QuizPhase;
	index: number;
	total: number;
	endsAt: number;
	playCount: number;
	question: Omit<QuizQuestion, 'correct' | 'answers' | 'value'> | null;
	answered: number;
	players: number;
	reveal?: { answer: string; correct: number | null; counts: number[]; winners: string[] };
	board: QuizBoardRow[];
	/** guest only */
	mine?: { answer: string | null; correct?: boolean; score: number };
}

/** Staff-only detail for the live quiz. */
export interface QuizStaffView {
	key: string;
	answers: { pid: string; name: string; answer: string; correct?: boolean }[];
}

export interface State {
	players: Record<string, Player>;
	tx: Tx[];
	orders: Order[];
	menu: MenuItem[];
	perks: Perk[];
	actions: QuickAction[];
	settings: Settings;
	feed: FeedItem[];
	tokens: Record<string, string>;
	staffTokens: string[];
	lastPaydayKey?: string;
	menuRevision?: number;
	quizzes: Quiz[];
	game: QuizGame | null;
}

// ---- snapshot (server -> client) ----

export interface PublicPlayer {
	id: string;
	name: string;
	balance: number;
	earned: number;
}

export interface QueueEntry {
	id: string;
	pname: string;
	itemName: string;
	virgin: boolean;
	priority: boolean;
	status: OrderStatus;
	ts: number;
}

export interface StaffOrder extends Order {
	pname: string;
}

export interface LogGroup {
	group: string;
	ts: number;
	kind: TxKind;
	reason: string;
	undone: boolean;
	entries: { pname: string; amt: number }[];
}

export interface Snapshot {
	role: 'guest' | 'staff' | 'public';
	authError?: boolean;
	now: number;
	players: PublicPlayer[];
	menu: MenuItem[];
	perks: Perk[];
	settings: Settings;
	feed: FeedItem[];
	queue: QueueEntry[];
	nextPayday: number | null;
	me?: { id: string; name: string; balance: number };
	myOrders?: Order[];
	myTx?: Tx[];
	orders?: StaffOrder[];
	log?: LogGroup[];
	actions?: QuickAction[];
	quiz: QuizView | null;
	quizzes?: Quiz[];
	quizStaff?: QuizStaffView;
}

// ---- defaults ----

export const MENU_REVISION = 5;
export const BARTENDERS_CHOICE_ID = 'bartenders-choice';

const menuItem = (id: string, name: string, desc: string, section: string, price: number, serve: Serve, stock: number | null = null): MenuItem => ({
	id, name, desc, section, price, serve, stock,
	img: `/illustrations/${id}.webp`,
	available: true,
});
const cocktail = (id: string, name: string, desc: string, section: string, price: number) =>
	menuItem(id, name, desc, section, price, 'bar');
const mocktail = (id: string, name: string, desc: string, section: string, price: number): MenuItem => ({
	...cocktail(id, name, desc, section, price), mocktail: true,
});
const food = (id: string, name: string, desc: string, section: string, price: number, stock: number | null = null) =>
	menuItem(id, name, desc, section, price, 'self', stock);

const bartendersChoice: MenuItem = {
	...cocktail(BARTENDERS_CHOICE_ID, 'Bartender’s Choice', 'Tell us the flavours you like, and we’ll choose a cocktail for you.', 'Bar classics', 15),
	img: '/illustrations/menu-waiter.webp',
};
const kinderBuenoTruffle = food('kinder-bueno-truffle', 'Kinder Bueno Truffle', '', 'Sweets', 4, 12);

export const DEFAULT_MENU: MenuItem[] = [
	bartendersChoice,
	// Bar classics
	cocktail("gin-tonic", "Gin & Tonic", "Gin, tonic water & lime.", "Bar classics", 10),
	cocktail("mojito", "Mojito", "White rum, fresh mint, lime, sugar & soda.", "Bar classics", 15),
	cocktail("cuba-libre", "Cuba Libre", "White rum, cola & fresh lime.", "Bar classics", 10),
	cocktail("tom-collins", "Tom Collins", "Gin, fresh lemon, sugar & soda.", "Bar classics", 10),
	cocktail("long-island-iced-tea", "Long Island Iced Tea", "Vodka, gin, tequila, white rum, orange liqueur, lemon, sugar syrup & cola.", "Bar classics", 25),
	cocktail("dry-martini", "Dry Martini", "Gin, dry vermouth & an olive.", "Bar classics", 15),

	// Citrus & sours
	cocktail("cosmopolitan", "Cosmopolitan", "Citrus vodka, orange liqueur, cranberry, lime & raspberries.", "Citrus & sours", 15),
	cocktail("daiquiri", "Classic Daiquiri", "White rum, fresh lime & sugar.", "Citrus & sours", 15),
	cocktail("margarita", "Margarita", "Tequila, orange liqueur & lime, with a salted rim.", "Citrus & sours", 15),
	cocktail("mango-margarita", "Mango Margarita", "Tequila, Cointreau, mango purée, lime & sugar syrup.", "Citrus & sours", 15),
	cocktail("caipirinha", "Caipirinha", "Cachaça, fresh lime & sugar, over crushed ice.", "Citrus & sours", 15),

	// Lemon & lime
	cocktail("white-lady", "White Lady", "Gin, orange liqueur, fresh lemon, sugar syrup & egg white.", "Lemon & lime", 15),
	cocktail("lemon-drop-martini", "Lemon Drop Martini", "Citrus vodka, orange liqueur & fresh lemon, with a sugar rim.", "Lemon & lime", 15),
	cocktail("kamikaze", "Kamikaze", "Vodka, orange liqueur & fresh lime.", "Lemon & lime", 15),
	cocktail("caipiroska", "Caipiroska", "Vodka, muddled lime & sugar, over crushed ice.", "Lemon & lime", 15),

	// Berry sweet
	cocktail("strawberry-daiquiri", "Strawberry Daiquiri", "White rum, frozen strawberries, fresh lime & sugar syrup.", "Berry sweet", 25),
	cocktail("raspberry-daiquiri", "Raspberry Daiquiri", "White rum, frozen raspberries, lime & sugar syrup, blended with ice.", "Berry sweet", 25),
	cocktail("bramble", "Bramble", "Gin, lemon, berry jam & berries, over crushed ice.", "Berry sweet", 15),

	// Tropical favourites
	cocktail("pina-colada", "Piña Colada", "White rum, pineapple & coconut cream.", "Tropical favourites", 25),
	cocktail("passionfruit-martini", "Passion Fruit Martini", "Vodka, passionfruit juice, lime & a hint of vanilla.", "Tropical favourites", 25),
	cocktail("tequila-sunrise", "Tequila Sunrise", "Tequila, orange juice & grenadine, with orange and a cherry.", "Tropical favourites", 10),

	// The whiskey hour
	cocktail("manhattan", "Manhattan", "Whiskey, sweet vermouth & aromatic bitters, with a cocktail cherry.", "The whiskey hour", 15),
	cocktail("old-fashioned", "Old Fashioned", "Bourbon or rye whiskey, sugar & aromatic bitters, with orange peel.", "The whiskey hour", 15),
	cocktail("whiskey-sour", "Whiskey Sour", "Whiskey, fresh lemon & sugar; optional egg-white foam.", "The whiskey hour", 15),

	// Coffee & cream
	cocktail("espresso-martini", "Espresso Martini", "Vodka, coffee liqueur & fresh espresso.", "Coffee & cream", 25),
	cocktail("tiramisu-espresso-martini", "Tiramisu Espresso Martini", "Baileys, vodka, espresso & coffee liqueur, with cocoa and a ladyfinger.", "Coffee & cream", 25),
	cocktail("mudslide", "Mudslide", "Vodka, coffee liqueur, Irish cream & cream, with a chocolate drizzle.", "Coffee & cream", 25),
	cocktail("white-russian", "White Russian", "Vodka, coffee liqueur & cream, over ice.", "Coffee & cream", 10),
	cocktail("black-russian", "Black Russian", "Vodka & coffee liqueur, over ice.", "Coffee & cream", 10),

	// Fresh & sparkling
	mocktail("raspberry-mint-fizz", "Raspberry & Mint Fizz", "Raspberries, mint, lime & lemon-lime soda.", "Fresh & sparkling", 10),
	mocktail("passionfruit-cooler", "Passionfruit Cooler", "Passionfruit nectar, lime, tonic water & mint.", "Fresh & sparkling", 10),
	mocktail("virgin-mojito", "Virgin Mojito", "Fresh mint, lime & lemon-lime soda.", "Fresh & sparkling", 10),
	mocktail("sunset-cooler", "Sunset Cooler", "Orange, pineapple, lime, groselha & lemon-lime soda.", "Fresh & sparkling", 10),
	mocktail("virgin-mango-margarita", "Virgin Mango Margarita", "Mango purée, fresh lime & lemon-lime soda, with a salt half-rim.", "Fresh & sparkling", 10),
	mocktail("passion-at-the-disco", "Passion at the Disco", "Fresh lime, passion fruit syrup & tonic water.", "Fresh & sparkling", 10),

	// Creamy & indulgent
	mocktail("virgin-pina-colada", "Virgin Piña Colada", "Pineapple, coconut milk, condensed coconut milk & lime.", "Creamy & indulgent", 10),
	mocktail("chocolate-martini", "Chocolate Martini", "Milk, condensed milk, chocolate, espresso & vanilla.", "Creamy & indulgent", 10),
	mocktail("espresso-cream-martini", "Espresso Cream Martini", "Espresso, milk, cream, sugar syrup & vanilla.", "Creamy & indulgent", 10),
	mocktail("vanilla-cream-fizz", "Vanilla Cream Fizz", "Lemon-lime soda, a splash of cream & vanilla.", "Creamy & indulgent", 10),

	// Sweets
	food("biscoff-mousse", "Biscoff Mousse", "Layers of mousse and Biscoff biscuit.", "Sweets", 8),
	food("oreo-mousse", "Oreo Mousse", "Cookies-and-cream mousse with Oreo crumbs.", "Sweets", 8),
	food("covered-oreos", "Covered Oreos", "White chocolate-coated sandwich biscuits.", "Sweets", 3),
	food("nutella-truffle", "Nutella Truffle", "Chocolate-coated Nutella truffle. Contains hazelnuts.", "Sweets", 4, 10),
	food("peanut-butter-truffle", "Peanut Butter Truffle", "Chocolate-coated peanut butter truffle topped with peanuts.", "Sweets", 4, 12),
	food("biscoff-truffle", "Biscoff Truffle", "White-coated truffle with Biscoff biscuit crumbs.", "Sweets", 4, 9),
	kinderBuenoTruffle,

	// Savouries
	food("croissant", "Croissant", "Flaky croissant.", "Savouries", 6),
	food("croquetes", "Croquetes", "Breaded Portuguese croquettes.", "Savouries", 5),
	food("rissois", "Rissóis", "Crescent-shaped Portuguese savoury pastries.", "Savouries", 5),
	food("other-savouries", "Assorted Savouries", "Ask what is on the table.", "Savouries", 5),
];

// Keep removed defaults available to historical order records and refunds.
const retiredDefaults = new Set(['mousse', 'pastry', 'brigadeiro', 'white-truffle', 'nut-bonbon', 'oreo']);

export function refreshMenu(previous: MenuItem[], revision = 0): MenuItem[] {
	if (revision >= MENU_REVISION) return previous;
	previous = previous.map(item => item.id === 'chocolate-cake' ? { ...item, available: false, archived: true } : item);
	if (revision === 4) return previous;
	previous = previous.map(item => item.id === BARTENDERS_CHOICE_ID ? { ...item, desc: bartendersChoice.desc } : item);
	if (revision === 3) return previous;
	if (revision === 2) {
		if (previous.some(item => item.id === kinderBuenoTruffle.id)) return previous;
		const menu = [...previous];
		const cakeIndex = menu.findIndex(item => item.id === 'chocolate-cake');
		menu.splice(cakeIndex < 0 ? menu.length : cakeIndex, 0, { ...kinderBuenoTruffle });
		return menu;
	}

	const existingChoice = previous.find(item => item.id === BARTENDERS_CHOICE_ID);
	const featured = existingChoice ? {
		...bartendersChoice,
		price: existingChoice.price,
		stock: existingChoice.stock,
		available: existingChoice.archived || existingChoice.available,
	} : { ...bartendersChoice };

	const remaining = previous.filter(item => item.id !== BARTENDERS_CHOICE_ID);
	if (revision === 1) return refreshMenu([featured, ...remaining], 2);

	const byId = new Map(remaining.map(item => [item.id, item]));
	const printed = DEFAULT_MENU.slice(1).map(item => {
		const existing = byId.get(item.id);
		byId.delete(item.id);
		return existing
			? { ...item, price: existing.price, available: existing.available, stock: existing.stock ?? item.stock }
			: { ...item };
	});
	return [featured, ...printed, ...Array.from(byId.values(), item =>
		retiredDefaults.has(item.id) ? { ...item, available: false, archived: true } : item,
	)];
}

export const DEFAULT_PERKS: Perk[] = [
	{ id: 'skip-queue', name: 'Skip the drinks queue', price: 15, needsTarget: false, effect: 'skipQueue' },
	{ id: 'karaoke-jump', name: 'Jump the karaoke queue', price: 10, needsTarget: false, effect: 'none' },
	{ id: 'mic-moment', name: 'Make a toast or dedication', price: 5, needsTarget: false, effect: 'none' },
	{ id: 'pick-song', name: "Pick someone's next song", price: 15, needsTarget: true, effect: 'none' },
	{ id: 'song-veto', name: 'Skip the current song', price: 15, needsTarget: false, effect: 'none' },
	{ id: 'force-duet', name: 'Choose a duet partner', price: 20, needsTarget: true, effect: 'none' },
	{ id: 'force-solo', name: 'Choose a solo singer', price: 25, needsTarget: true, effect: 'none' },
	{ id: 'quiz-category', name: 'Pick the next quiz category', price: 10, needsTarget: false, effect: 'none' },
	{ id: 'quiz-5050', name: 'Quiz 50/50: remove two wrong answers', price: 15, needsTarget: false, effect: 'none' },
	{ id: 'steal-question', name: "Take another team's quiz question", price: 20, needsTarget: false, effect: 'none' },
];

const PREVIOUS_PERK_NAMES: Readonly<Record<string, string>> = {
	'mic-moment': 'Mic moment: a toast or dedication',
	'song-veto': 'Veto the current song',
	'force-duet': 'Force someone into a duet with you',
	'force-solo': 'Make someone sing solo',
	'steal-question': "Steal another team's quiz question",
};

export function refreshPerkNames(perks: Perk[]): Perk[] {
	return perks.map(perk => {
		if (perk.name !== PREVIOUS_PERK_NAMES[perk.id]) return perk;
		const current = DEFAULT_PERKS.find(item => item.id === perk.id);
		return current ? { ...perk, name: current.name } : perk;
	});
}

export const DEFAULT_ACTIONS: QuickAction[] = [
	{ id: 'quiz1', label: 'Quiz 1st', amount: 30, kind: 'prize' },
	{ id: 'quiz2', label: 'Quiz 2nd', amount: 20, kind: 'prize' },
	{ id: 'quiz3', label: 'Quiz 3rd', amount: 10, kind: 'prize' },
	{ id: 'karaoke', label: 'Best karaoke', amount: 15, kind: 'prize' },
	{ id: 'game', label: 'Game win', amount: 10, kind: 'prize' },
	{ id: 'bottle', label: 'Brought a bottle', amount: 30, kind: 'contribution' },
	{ id: 'ingredients', label: 'Brought ingredients', amount: 10, kind: 'contribution' },
	{ id: 'candy-in', label: 'Candy → coins', amount: 10, kind: 'exchange' },
	{ id: 'cigs-in', label: 'Cigarettes → coins', amount: 20, kind: 'exchange' },
	{ id: 'candy-out', label: 'Coins → candy', amount: -10, kind: 'exchange' },
	{ id: 'cigs-out', label: 'Coins → cigarettes', amount: -20, kind: 'exchange' },
];

export const DEFAULT_SETTINGS: Settings = {
	startBalance: 30,
	paydayAmount: 10,
	paydayHours: [19, 20, 21, 22, 23, 0],
	autoPayday: true,
	barOpen: true,
	maxActiveOrders: 2,
};

export const defaultState = (): State => ({
	players: {},
	tx: [],
	orders: [],
	menu: structuredClone(DEFAULT_MENU),
	menuRevision: MENU_REVISION,
	perks: structuredClone(DEFAULT_PERKS),
	actions: structuredClone(DEFAULT_ACTIONS),
	settings: structuredClone(DEFAULT_SETTINGS),
	feed: [],
	tokens: {},
	staffTokens: [],
	quizzes: [],
	game: null,
});

export const TX_KINDS: TxKind[] = [
	'start',
	'payday',
	'prize',
	'contribution',
	'exchange',
	'order',
	'purchase',
	'perk',
	'transfer',
	'adjust',
];
