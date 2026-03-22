import teamsData from './teams.js';

class BrasileiraoSimulator {
    constructor() {
        this.teams = teamsData.map(team => ({
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
        
        this.rounds = [];
        this.currentRound = 0;
        this.allMatches = [];
        
        this.init();
    }

    init() {
        this.generateRounds();
        this.updateTable();
        this.displayRound();
    }

    // Berger Algorithm to generate 38 rounds
    generateRounds() {
        const teamIds = this.teams.map(t => t.id);
        const n = teamIds.length;
        const roundsCount = n - 1;
        const matchesPerRound = n / 2;

        let schedule = [];

        // Round Robin (First Leg)
        for (let r = 0; r < roundsCount; r++) {
            let matches = [];
            for (let i = 0; i < matchesPerRound; i++) {
                const home = (r + i) % (n - 1);
                let away = (n - 1 - i + r) % (n - 1);
                
                if (i === 0) away = n - 1;

                // Home/away alternation
                if (r % 2 === 0) {
                    matches.push({ home: teamIds[home], away: teamIds[away], homeScore: null, awayScore: null });
                } else {
                    matches.push({ home: teamIds[away], away: teamIds[home], homeScore: null, awayScore: null });
                }
            }
            schedule.push(matches);
        }

        // Second Leg (Reverse fixtures)
        const secondLeg = schedule.map(round => {
            return round.map(match => ({
                home: match.away,
                away: match.home,
                homeScore: null,
                awayScore: null
            }));
        });

        this.rounds = [...schedule, ...secondLeg];
    }

    simulateMatch(match) {
        if (match.homeScore !== null) return; // Already simulated

        const homeTeam = this.teams.find(t => t.id === match.home);
        const awayTeam = this.teams.find(t => t.id === match.away);

        // Strength-based simulation (simplified Poisson-like)
        const homeAdvantage = 1.1; // 10% home advantage
        const homeStrength = homeTeam.strength * homeAdvantage;
        const awayStrength = awayTeam.strength;

        const totalStrength = homeStrength + awayStrength;
        
        // Random goals based on strength
        // Mean goals ~ 1.5 per team, adjusted
        const homeMean = (homeStrength / totalStrength) * 3;
        const awayMean = (awayStrength / totalStrength) * 2.5;

        match.homeScore = this.poissonRandom(homeMean);
        match.awayScore = this.poissonRandom(awayMean);

        this.updateStandings(match);
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

    updateStandings(match) {
        const home = this.teams.find(t => t.id === match.home);
        const away = this.teams.find(t => t.id === match.away);

        home.played++;
        away.played++;
        home.goalsFor += match.homeScore;
        home.goalsAgainst += match.awayScore;
        away.goalsFor += match.awayScore;
        away.goalsAgainst += match.homeScore;

        if (match.homeScore > match.awayScore) {
            home.points += 3;
            home.won++;
            away.lost++;
        } else if (match.homeScore < match.awayScore) {
            away.points += 3;
            away.won++;
            home.lost++;
        } else {
            home.points += 1;
            away.points += 1;
            home.drawn++;
            away.drawn++;
        }

        home.goalDiff = home.goalsFor - home.goalsAgainst;
        away.goalDiff = away.goalsFor - away.goalsAgainst;

        home.percentage = home.played > 0 ? ((home.points / (home.played * 3)) * 100).toFixed(1) : 0;
        away.percentage = away.played > 0 ? ((away.points / (away.played * 3)) * 100).toFixed(1) : 0;
    }

    simulateRound() {
        if (this.currentRound >= this.rounds.length) return;

        const roundMatches = this.rounds[this.currentRound];
        roundMatches.forEach(m => this.simulateMatch(m));

        this.currentRound++;
        this.updateTable();
        this.displayRound();
        this.updateStats();
    }

    simulateSeason() {
        while (this.currentRound < this.rounds.length) {
            this.simulateRound();
        }
    }

    resetSeason() {
        this.teams.forEach(t => {
            t.points = 0; t.played = 0; t.won = 0; t.drawn = 0;
            t.lost = 0; t.goalsFor = 0; t.goalsAgainst = 0;
            t.goalDiff = 0; t.percentage = 0;
        });
        
        this.rounds.forEach(r => r.forEach(m => {
            m.homeScore = null;
            m.awayScore = null;
        }));
        
        this.currentRound = 0;
        this.updateTable();
        this.displayRound();
        this.updateStats();
    }

    updateTable() {
        // Sort criteria: Points > Wins > GD > GF
        const sortedTeams = [...this.teams].sort((a, b) => {
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
                    <div class="team-name">
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
        const container = document.getElementById('fixtures-container');
        const roundNumEl = document.getElementById('current-round-number');
        
        if (this.currentRound >= this.rounds.length) {
            container.innerHTML = '<div style="text-align:center; padding: 2rem; color: var(--text-secondary);">Temporada Finalizada!</div>';
            return;
        }

        roundNumEl.textContent = this.currentRound + 1;
        container.innerHTML = '';

        const currentMatches = this.rounds[this.currentRound];
        currentMatches.forEach(match => {
            const home = this.teams.find(t => t.id === match.home);
            const away = this.teams.find(t => t.id === match.away);

            const div = document.createElement('div');
            div.className = 'fixture';
            div.innerHTML = `
                <span class="fixture-team home">${home.name}</span>
                <div style="display: flex; gap: 5px;">
                    <span class="score-input">${match.homeScore ?? '-'}</span>
                    <span>X</span>
                    <span class="score-input">${match.awayScore ?? '-'}</span>
                </div>
                <span class="fixture-team away">${away.name}</span>
            `;
            container.appendChild(div);
        });
    }

    updateStats() {
        let totalGoals = 0;
        let totalMatches = 0;
        
        this.rounds.forEach(r => r.forEach(m => {
            if (m.homeScore !== null) {
                totalGoals += m.homeScore + m.awayScore;
                totalMatches++;
            }
        }));

        document.getElementById('total-goals').textContent = totalGoals;
        document.getElementById('avg-goals').textContent = totalMatches > 0 ? (totalGoals / totalMatches).toFixed(2) : '0';
        document.getElementById('round-progress').textContent = `${this.currentRound}/38`;
        
        if (this.currentRound === 38) {
            document.getElementById('status-badge').textContent = 'Temporada Encerrada';
            document.getElementById('status-badge').style.borderColor = 'var(--gold)';
            document.getElementById('status-badge').style.color = 'var(--gold)';
        } else {
            document.getElementById('status-badge').textContent = 'Temporada em Andamento';
            document.getElementById('status-badge').style.borderColor = 'var(--accent)';
            document.getElementById('status-badge').style.color = 'var(--accent)';
        }
    }
}

// Global instance for onclick access
window.simulator = new BrasileiraoSimulator();
export default window.simulator;
