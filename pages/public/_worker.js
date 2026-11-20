export default {
	fetch(request, env) {
		return env.PARTY_APP.fetch(request);
	},
};
