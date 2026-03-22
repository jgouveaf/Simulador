import teamsData from './teams.js';

class BrasileiraoSimulator {
    constructor() {
        this.allTeamsRaw = teamsData;
        this.currentSerie = 'A';
        this.leagues = {
            'A': this.initLeague('A'),
            'B': this.initLeague('B')
        };
        
        this.init();
    }

    initLeague(serie) {
        const teams = this.allTeamsRaw
            .filter(t => t.serie === serie)
            .map(team => ({
                ...team,
                points: 0,
                played: 0,
                won: 0,
                drawn: 0,
                lost: 0,
                goalsFor: 0,
                goalsAgainst: 0,
                goalDiff: 0,
                percentage: 0
            }));

        const rounds = this.generateRounds(teams);
        
        return {
            teams,
            rounds,
            currentRound: 0,
            status: 'Iniciada'
        };
    }

    init() {
        this.updateTable();
        this.displayRound();
        this.updateStats();
        this.updateHistory();
        
        document.getElementById('serie-selector').addEventListener('change', (e) => {
            this.currentSerie = e.target.value;
            this.updateTable();
            this.displayRound();
            this.updateStats();
            this.updateHistory();
        });

        // Close modal on outside click
        window.onclick = (event) => {
            const modal = document.getElementById('team-modal');
            if (event.target == modal) {
                this.closeModal();
            }
        };
    }

    generateRounds(teams) {
        const teamIds = teams.map(t => t.id);
        const n = teamIds.length;
        const roundsCount = n - 1;
        const matchesPerRound = n / 2;

        let schedule = [];
        for (let r = 0; r < roundsCount; r++) {
            let matches = [];
            for (let i = 0; i < matchesPerRound; i++) {
                const home = (r + i) % (n - 1);
                let away = (n - 1 - i + r) % (n - 1);
                if (i === 0) away = n - 1;

                if (r % 2 === 0) {
                    matches.push({ home: teamIds[home], away: teamIds[away], homeScore: null, awayScore: null });
                } else {
                    matches.push({ home: teamIds[away], away: teamIds[home], homeScore: null, awayScore: null });
                }
            }
            schedule.push(matches);
        }

        const secondLeg = schedule.map(round => {
            return round.map(match => ({
                home: match.away,
                away: match.home,
                homeScore: null,
                awayScore: null
            }));
        });

        return [...schedule, ...secondLeg];
    }

    simulateMatch(match, leagueTeams) {
        if (match.homeScore !== null) return;

        const homeTeam = leagueTeams.find(t => t.id === match.home);
        const awayTeam = leagueTeams.find(t => t.id === match.away);

        const homeAdvantage = 1.10;
        const hStr = Math.pow(homeTeam.strength * homeAdvantage, 1.5);
        const aStr = Math.pow(awayTeam.strength, 1.5);
        const totalStr = hStr + aStr;

        const targetMatchMean = 2.37;
        const hMean = (hStr / totalStr) * targetMatchMean;
        const aMean = (aStr / totalStr) * targetMatchMean;

        let hScore = this.poissonRandom(hMean);
        let aScore = this.poissonRandom(aMean);

        if (hScore === aScore && Math.random() < 0.3) {
            if (hStr > aStr * 1.05) hScore++;
            else if (aStr > hStr * 1.05) aScore++;
        }

        match.homeScore = Math.min(hScore, 9);
        match.awayScore = Math.min(aScore, 9);

        this.updateLeagueStandings(match, leagueTeams);
    }

    poissonRandom(mean) {
        let L = Math.exp(-mean);
        let k = 0;
        let p = 1;
        do {
            k++;
            p *= Math.random();
        } while (p > L);
        return k - 1;
    }

    updateLeagueStandings(match, teams) {
        const home = teams.find(t => t.id === match.home);
        const away = teams.find(t => t.id === match.away);

        home.played++;
        away.played++;
        home.goalsFor += match.homeScore;
        home.goalsAgainst += match.awayScore;
        away.goalsFor += match.awayScore;
        away.goalsAgainst += match.homeScore;

        if (match.homeScore > match.awayScore) {
            home.points += 3; home.won++; away.lost++;
        } else if (match.homeScore < match.awayScore) {
            away.points += 3; away.won++; home.lost++;
        } else {
            home.points += 1; away.points += 1; home.drawn++; away.drawn++;
        }

        home.goalDiff = home.goalsFor - home.goalsAgainst;
        away.goalDiff = away.goalsFor - away.goalsAgainst;
        home.percentage = home.played > 0 ? ((home.points / (home.played * 3)) * 100).toFixed(1) : 0;
        away.percentage = away.played > 0 ? ((away.points / (away.played * 3)) * 100).toFixed(1) : 0;
    }

    simulateRound() {
        const lg = this.leagues[this.currentSerie];
        if (lg.currentRound >= lg.rounds.length) return;

        lg.rounds[lg.currentRound].forEach(m => this.simulateMatch(m, lg.teams));
        lg.currentRound++;
        
        this.updateTable();
        this.displayRound();
        this.updateStats();
        this.updateHistory();
    }

    simulateSeason() {
        const lg = this.leagues[this.currentSerie];
        while (lg.currentRound < lg.rounds.length) {
            this.simulateRound();
        }
    }

    resetSeason() {
        this.leagues[this.currentSerie] = this.initLeague(this.currentSerie);
        this.updateTable();
        this.displayRound();
        this.updateStats();
        this.updateHistory();
    }

    updateTable() {
        const lg = this.leagues[this.currentSerie];
        const sortedTeams = [...lg.teams].sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;
            if (b.won !== a.won) return b.won - a.won;
            if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
            return b.goalsFor - a.goalsFor;
        });

        const tbody = document.getElementById('standings-body');
        tbody.innerHTML = '';

        sortedTeams.forEach((team, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="pos">${index + 1}</td>
                <td>
                    <div class="team-name team-clickable" onclick="simulator.showTeamDetails(${team.id})">
                        <div class="team-color" style="background-color: ${team.color};"></div>
                        ${team.name}
                    </div>
                </td>
                <td class="stats pts">${team.points}</td>
                <td class="stats">${team.played}</td>
                <td class="stats">${team.won}</td>
                <td class="stats">${team.drawn}</td>
                <td class="stats">${team.lost}</td>
                <td class="stats">${team.goalsFor}</td>
                <td class="stats">${team.goalsAgainst}</td>
                <td class="stats">${team.goalDiff}</td>
                <td class="stats">${team.percentage}%</td>
            `;
            tbody.appendChild(tr);
        });
    }

    displayRound() {
        const lg = this.leagues[this.currentSerie];
        const container = document.getElementById('fixtures-container');
        const roundNumEl = document.getElementById('current-round-number');
        
        roundNumEl.textContent = lg.currentRound + 1;
        container.innerHTML = '';

        if (lg.currentRound >= lg.rounds.length) {
            container.innerHTML = '<div style="text-align:center; padding: 2rem; color: var(--text-secondary);">Temporada Finalizada!</div>';
            return;
        }

        const currentMatches = lg.rounds[lg.currentRound];
        currentMatches.forEach(match => {
            const home = lg.teams.find(t => t.id === match.home);
            const away = lg.teams.find(t => t.id === match.away);

            const div = document.createElement('div');
            div.className = 'fixture';
            div.innerHTML = `
                <span class="fixture-team home team-clickable" onclick="simulator.showTeamDetails(${home.id})">${home.name}</span>
                <div style="display: flex; gap: 5px; align-items: center;">
                    <span class="score-input">${match.homeScore ?? '-'}</span>
                    <span style="font-size: 0.6rem; color: var(--text-secondary);">X</span>
                    <span class="score-input">${match.awayScore ?? '-'}</span>
                </div>
                <span class="fixture-team away team-clickable" onclick="simulator.showTeamDetails(${away.id})">${away.name}</span>
            `;
            container.appendChild(div);
        });
    }

    updateStats() {
        const lg = this.leagues[this.currentSerie];
        let totalGoals = 0;
        let totalMatches = 0;
        
        lg.rounds.forEach(r => r.forEach(m => {
            if (m.homeScore !== null) {
                totalGoals += m.homeScore + m.awayScore;
                totalMatches++;
            }
        }));

        document.getElementById('total-goals').textContent = totalGoals;
        document.getElementById('avg-goals').textContent = totalMatches > 0 ? (totalGoals / totalMatches).toFixed(2) : '0';
        document.getElementById('round-progress').textContent = `${lg.currentRound}/38`;
        
        const badge = document.getElementById('status-badge');
        if (lg.currentRound === 38) {
            badge.textContent = 'Temporada Encerrada';
            badge.style.color = 'var(--gold)';
        } else {
            badge.textContent = 'Em Andamento';
            badge.style.color = 'var(--accent)';
        }
    }

    updateHistory() {
        const container = document.getElementById('history-container');
        const lg = this.leagues[this.currentSerie];
        
        const lastRounds = lg.rounds
            .slice(0, lg.currentRound)
            .reverse() 
            .slice(0, 3);

        if (lastRounds.length === 0) {
            container.innerHTML = '<div style="color: var(--text-secondary);">Nenhum jogo realizado ainda.</div>';
            return;
        }

        container.innerHTML = '';
        lastRounds.forEach((round, i) => {
            const roundTitle = document.createElement('div');
            roundTitle.style.fontWeight = 'bold';
            roundTitle.style.marginTop = '10px';
            roundTitle.style.borderBottom = '1px solid var(--border)';
            roundTitle.style.paddingBottom = '5px';
            roundTitle.textContent = `Rodada ${lg.currentRound - i}`;
            container.appendChild(roundTitle);

            round.forEach(match => {
                const home = lg.teams.find(t => t.id === match.home);
                const away = lg.teams.find(t => t.id === match.away);
                const matchDiv = document.createElement('div');
                matchDiv.style.display = 'flex';
                matchDiv.style.justifyContent = 'space-between';
                matchDiv.style.padding = '5px 0';
                matchDiv.innerHTML = `<span class="team-clickable" onclick="simulator.showTeamDetails(${home.id})">${home.name}</span> <span style="font-weight:bold;">${match.homeScore} - ${match.awayScore}</span> <span class="team-clickable" onclick="simulator.showTeamDetails(${away.id})">${away.name}</span>`;
                container.appendChild(matchDiv);
            });
        });
    }

    showTeamDetails(teamId) {
        const team = this.allTeamsRaw.find(t => t.id === teamId);
        if (!team || !team.roster) {
            console.warn("Details not available for this team.");
            return;
        }

        const modal = document.getElementById('team-modal');
        const header = document.getElementById('modal-header');
        const titulares = document.getElementById('titulares-list');
        const reservas = document.getElementById('reservas-list');

        header.innerHTML = `
            <div style="width: 15px; height: 15px; background: ${team.color}; border-radius: 50%;"></div>
            <h2 style="font-size: 2rem;">${team.name}</h2>
            <div class="badge" style="background: var(--border); margin-left: auto;">GER: ${team.strength}</div>
        `;

        const renderRoster = (players, container) => {
            const list = container.querySelector('div') || document.createElement('div');
            list.innerHTML = '';
            players.forEach(p => {
                const div = document.createElement('div');
                div.className = 'player-item';
                div.innerHTML = `
                    <div style="display: flex; gap: 10px;">
                        <span class="player-pos">${p.pos}</span>
                        <span>${p.name}</span>
                    </div>
                    <span class="player-strength">${p.strength}</span>
                `;
                list.appendChild(div);
            });
            container.appendChild(list);
        };

        renderRoster(team.roster.filter(p => p.status === 'Titular'), titulares);
        renderRoster(team.roster.filter(p => p.status === 'Reserva'), reservas);

        modal.style.display = 'block';
    }

    closeModal() {
        document.getElementById('team-modal').style.display = 'none';
    }
}

window.simulator = new BrasileiraoSimulator();
export default window.simulator;
