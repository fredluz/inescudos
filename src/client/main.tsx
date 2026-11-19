import { render } from 'preact';
import { Guest } from './guest';
import { Toasts } from './lib';
import { Staff } from './staff';
import { Tv } from './tv';

const path = location.pathname.replace(/\/+$/, '');
const Screen = path === '/staff' ? Staff : path === '/tv' ? Tv : Guest;

render(
	<>
		<Screen />
		<Toasts />
	</>,
	document.getElementById('root')!,
);
