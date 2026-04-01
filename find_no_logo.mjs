
import teams from './teams.js';

const teamsWithoutLogo = teams.filter(t => !t.logo || t.logo === "");
console.log(JSON.stringify(teamsWithoutLogo.map(t => ({id: t.id, name: t.name, rosterSize: t.roster.length})), null, 2));
