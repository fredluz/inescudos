export type Serve = 'bar' | 'self';

export interface MenuItem {
	id: string;
	name: string;
	desc: string;
	section: string;
	price: number;
	serve: Serve;
	img: string;
	emoji: string;
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
}

// ---- defaults ----

const IMG = 'https://ines-cocktail-night.pages.dev/assets/optimized/menu/';

const cocktail = (
	id: string,
	name: string,
	desc: string,
	section: 'Easy pours' | 'Shaken & muddled' | 'Showstoppers',
): MenuItem => ({
	id,
	name,
	desc,
	section,
	price: section === 'Easy pours' ? 10 : section === 'Shaken & muddled' ? 15 : 25,
	serve: 'bar',
	img: `${IMG}${id}.webp`,
	emoji: '🍸',
	available: true,
	stock: null,
});

const sweet = (id: string, name: string, desc: string, price: number, emoji: string): MenuItem => ({
	id,
	name,
	desc,
	section: 'Sweets',
	price,
	serve: 'self',
	img: '',
	emoji,
	available: true,
	stock: null,
});

export const DEFAULT_MENU: MenuItem[] = [
	cocktail('gin-tonic', 'Gin & Tonic', 'Gin, tonic water & lime.', 'Easy pours'),
	cocktail('cuba-libre', 'Cuba Libre', 'White rum, cola & fresh lime.', 'Easy pours'),
	cocktail('tom-collins', 'Tom Collins', 'Gin, fresh lemon, sugar & soda.', 'Easy pours'),
	cocktail('tequila-sunrise', 'Tequila Sunrise', 'Tequila, orange juice & grenadine.', 'Easy pours'),
	cocktail('black-russian', 'Black Russian', 'Vodka & coffee liqueur, over ice.', 'Easy pours'),
	cocktail('white-russian', 'White Russian', 'Vodka, coffee liqueur & cream, over ice.', 'Easy pours'),
	cocktail('margarita', 'Margarita', 'Tequila, orange liqueur & lime, salted rim.', 'Shaken & muddled'),
	cocktail('daiquiri', 'Classic Daiquiri', 'White rum, fresh lime & sugar.', 'Shaken & muddled'),
	cocktail('mojito', 'Mojito', 'White rum, fresh mint, lime, sugar & soda.', 'Shaken & muddled'),
	cocktail('caipirinha', 'Caipirinha', 'Cachaça, fresh lime & sugar, crushed ice.', 'Shaken & muddled'),
	cocktail('caipiroska', 'Caipiroska', 'Vodka, muddled lime & sugar, crushed ice.', 'Shaken & muddled'),
	cocktail('cosmopolitan', 'Cosmopolitan', 'Citrus vodka, orange liqueur, cranberry & lime.', 'Shaken & muddled'),
	cocktail('whiskey-sour', 'Whiskey Sour', 'Whiskey, fresh lemon & sugar.', 'Shaken & muddled'),
	cocktail('white-lady', 'White Lady', 'Gin, orange liqueur & fresh lemon.', 'Shaken & muddled'),
	cocktail('lemon-drop-martini', 'Lemon Drop Martini', 'Citrus vodka, orange liqueur & lemon, sugar rim.', 'Shaken & muddled'),
	cocktail('kamikaze', 'Kamikaze', 'Vodka, orange liqueur & fresh lime.', 'Shaken & muddled'),
	cocktail('old-fashioned', 'Old Fashioned', 'Bourbon or rye, sugar & bitters, orange peel.', 'Shaken & muddled'),
	cocktail('manhattan', 'Manhattan', 'Whiskey, sweet vermouth & bitters, cherry.', 'Shaken & muddled'),
	cocktail('espresso-martini', 'Espresso Martini', 'Vodka, coffee liqueur & fresh espresso.', 'Showstoppers'),
	cocktail('passionfruit-martini', 'Passion Fruit Martini', 'Vanilla vodka, passion fruit, lime & vanilla.', 'Showstoppers'),
	cocktail('pina-colada', 'Piña Colada', 'White rum, pineapple & coconut cream.', 'Showstoppers'),
	cocktail('strawberry-daiquiri', 'Strawberry Daiquiri', 'Rum, strawberries, lime & sugar, blended.', 'Showstoppers'),
	cocktail('raspberry-daiquiri', 'Raspberry Daiquiri', 'Rum, raspberries, lime & sugar, blended.', 'Showstoppers'),
	cocktail('mudslide', 'Mudslide', 'Vodka, coffee liqueur, Irish cream & chocolate.', 'Showstoppers'),
	cocktail('long-island-iced-tea', 'Long Island Iced Tea', 'Five spirits, lemon & cola. Good luck.', 'Showstoppers'),
	{
		...cocktail('bartenders-choice', "Bartender's Choice", 'Tell Inês your mood, she picks.', 'Shaken & muddled'),
		img: '',
		emoji: '✨',
	},
	sweet('chocolate-cake', 'Chocolate cake', 'A slice of the birthday cake.', 10, '🎂'),
	sweet('mousse', 'Mousse', 'One mousse cup.', 8, '🍮'),
	sweet('pastry', 'Pastry slice', 'Flaky pastry, sweet filling.', 6, '🥐'),
	sweet('brigadeiro', 'Brigadeiro', 'Dark chocolate truffle.', 4, '🍫'),
	sweet('white-truffle', 'White chocolate truffle', 'With a crunchy crumb on top.', 4, '⚪'),
	sweet('nut-bonbon', 'Chocolate nut bonbon', 'Dark chocolate, nut on top.', 4, '🌰'),
	sweet('oreo', 'Oreos', 'A couple of Oreos.', 3, '🍪'),
];

export const DEFAULT_PERKS: Perk[] = [
	{ id: 'skip-queue', name: 'Skip the drinks queue', price: 15, needsTarget: false, effect: 'skipQueue' },
	{ id: 'karaoke-jump', name: 'Jump the karaoke queue', price: 10, needsTarget: false, effect: 'none' },
	{ id: 'mic-moment', name: 'Mic moment: a toast or dedication', price: 5, needsTarget: false, effect: 'none' },
	{ id: 'pick-song', name: "Pick someone's next song", price: 15, needsTarget: true, effect: 'none' },
	{ id: 'song-veto', name: 'Veto the current song', price: 15, needsTarget: false, effect: 'none' },
	{ id: 'force-duet', name: 'Force someone into a duet with you', price: 20, needsTarget: true, effect: 'none' },
	{ id: 'force-solo', name: 'Make someone sing solo', price: 25, needsTarget: true, effect: 'none' },
	{ id: 'quiz-category', name: 'Pick the next quiz category', price: 10, needsTarget: false, effect: 'none' },
	{ id: 'quiz-5050', name: 'Quiz 50/50: remove two wrong answers', price: 15, needsTarget: false, effect: 'none' },
	{ id: 'steal-question', name: "Steal another team's quiz question", price: 20, needsTarget: false, effect: 'none' },
];

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
	perks: structuredClone(DEFAULT_PERKS),
	actions: structuredClone(DEFAULT_ACTIONS),
	settings: structuredClone(DEFAULT_SETTINGS),
	feed: [],
	tokens: {},
	staffTokens: [],
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
