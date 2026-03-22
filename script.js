import teamsData from './teams.js';

class BrasileiraoSimulator {
    constructor() {
        this.allTeamsRaw = teamsData;
        this.currentSerie = 'A';
        this.leagues = {
            'A': this.initLeague('A'),
            'B': this.initLeague('B')
        };
        
        this.career = {
            active: false,
            team: null,
            budget: 50000000,
            manager: 'João Gouvêa'
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
        this.displayCalendar();
        this.setupFriendlySelects();
        
        // Tab switching logic
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
            });
        });

        window.onclick = (event) => {
            const modal = document.getElementById('team-modal');
            if (event.target == modal) {
                this.closeModal();
            }
        };
    }

    openScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(`${screenId}-screen`).classList.add('active');
        
        if (screenId === 'career-hub') {
            this.updateCareerDashboard();
        }
    }

    switchTab(tabId) {
        document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
        document.getElementById(`tab-${tabId}`).style.display = 'block';
        
        if (tabId === 'standings') this.renderCareerStandings();
        if (tabId === 'fixtures') this.renderCareerFixtures();
        if (tabId === 'transfers') this.renderMarket();
        if (tabId === 'squad') this.renderCareerSquad();
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

        return [...schedule, ...secondLeg].map((round, index) => {
            return {
                matches: round,
                date: this.generateRoundDate(index)
            };
        });
    }

    generateRoundDate(roundIndex) {
        const start = new Date(2026, 3, 18); // April 18, 2026
        const date = new Date(start);
        date.setDate(start.getDate() + (roundIndex * 7));
        return date;
    }

    getTeamStats(team) {
        if (!team || !team.roster || team.roster.length === 0) {
            return { atk: team?.strength || 70, def: team?.strength || 70 };
        }

        const titulares = team.roster.filter(p => p.status === 'Titular');
        if (titulares.length === 0) return { atk: team.strength, def: team.strength };

        const defPositions = ['GOL', 'ZAG', 'LD', 'LE', 'VOL'];
        const atkPositions = ['MEI', 'ATA', 'CA'];

        const defPlayers = titulares.filter(p => defPositions.includes(p.pos));
        const atkPlayers = titulares.filter(p => atkPositions.includes(p.pos));

        const avgDef = defPlayers.reduce((sum, p) => sum + p.strength, 0) / (defPlayers.length || 1);
        const avgAtk = atkPlayers.reduce((sum, p) => sum + p.strength, 0) / (atkPlayers.length || 1);

        return { atk: avgAtk, def: avgDef };
    }

    simulateMatch(match, leagueTeams) {
        if (match.homeScore !== null) return;

        const homeTeam = leagueTeams.find(t => t.id === match.home);
        const awayTeam = leagueTeams.find(t => t.id === match.away);

        const homeStats = this.getTeamStats(homeTeam);
        const awayStats = this.getTeamStats(awayTeam);

        // REALISTIC PARAMETERS
        const homeAdvantage = 1.15; // Mandatory for realism (15% advantage)
        const targetMatchMean = 2.37; // User requested balance

        // A small amount of random "game-day" mood variation (+-10%)
        const gameVibe = 0.9 + Math.random() * 0.2;

        // Formula: Score is a function of (Attack Ratio / Defense Power)
        // Using a power of 2.8 makes the strength gaps very impactful, like top teams dominating.
        // homeMean = (HomeAtk * Factor / AwayDef) * baseline
        const hRatio = Math.pow((homeStats.atk * homeAdvantage) / awayStats.def, 2.8);
        const aRatio = Math.pow(awayStats.atk / homeStats.def, 2.8);
        const totalRatio = hRatio + aRatio;

        let hMean = (hRatio / totalRatio) * targetMatchMean * gameVibe;
        let aMean = (aRatio / totalRatio) * targetMatchMean * gameVibe;

        // DIXON-COLES Style Adjustment for low scores (0-0, 1-1, 1-0, 0-1)
        // We slightly inflate the probability of these scores by adjusting the mean or nudging outcomes.
        let hScore = this.poissonRandom(hMean);
        let aScore = this.poissonRandom(aMean);

        // Nudge to avoid unrealistic draws between teams with huge strength gaps
        if (hScore === aScore && Math.random() < 0.45) {
            const gap = homeTeam.strength - awayTeam.strength;
            if (gap > 6 && Math.random() < 0.7) hScore++; // Favorite (Home) scores one more
            else if (gap < -6 && Math.random() < 0.7) aScore++; // Favorite (Away) scores one more
        }

        // Brazilian League typical "Upset" chance (Z4 winning against G4 at home)
        if (homeTeam.strength < awayTeam.strength - 10 && Math.random() < 0.15) {
             // Home underdog "bus parking" logic: low scores preferred.
             if (hScore < aScore) { hScore = aScore; } // Force at least a draw for the upset
        }

        match.homeScore = Math.min(hScore, 8); // Rare to see 9+ in real life
        match.awayScore = Math.min(aScore, 8);

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

        lg.rounds[lg.currentRound].matches.forEach(m => this.simulateMatch(m, lg.teams));
        lg.currentRound++;
        lg.viewedRound = lg.currentRound < 38 ? lg.currentRound : 37;
        
        this.updateTable();
        this.displayRound();
        this.updateStats();
        this.displayCalendar();

        if (this.career.active) {
            this.updateCareerDashboard();
        }
    }

    simulateSeason() {
        const lg = this.leagues[this.currentSerie];
        while (lg.currentRound < lg.rounds.length) {
            this.simulateRound();
        }
    }

    resetSeason() {
        this.leagues[this.currentSerie] = this.initLeague(this.currentSerie);
        const lg = this.leagues[this.currentSerie];
        lg.viewedRound = 0;
        this.updateTable();
        this.displayRound();
        this.updateStats();
        this.displayCalendar();
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
            if (index < 4) tr.style.borderLeft = '4px solid var(--gold)';
            else if (index >= 16) tr.style.borderLeft = '4px solid var(--red)';
            
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

    toggleView() {
        const tableView = document.getElementById('table-view');
        const calendarView = document.getElementById('calendar-view');
        const detailPanel = document.querySelector('.panel'); // The sidebar/round nav
        const btn = document.getElementById('view-toggle');

        if (tableView.style.display === 'none') {
            tableView.style.display = 'block';
            detailPanel.style.display = 'block';
            calendarView.style.display = 'none';
            if (btn) btn.textContent = 'Ver Calendário Completo';
        } else {
            tableView.style.display = 'none';
            detailPanel.style.display = 'none';
            calendarView.style.display = 'block';
            if (btn) btn.textContent = 'Voltar para Tabela';
            this.displayCalendar();
        }
    }

    changeViewedRound(delta) {
        const lg = this.leagues[this.currentSerie];
        if (!lg.viewedRound && lg.viewedRound !== 0) lg.viewedRound = lg.currentRound;
        
        lg.viewedRound += delta;
        if (lg.viewedRound < 0) lg.viewedRound = 0;
        if (lg.viewedRound > 37) lg.viewedRound = 37;
        
        this.displayRound();
    }

    displayRound() {
        const lg = this.leagues[this.currentSerie];
        
        // Ensure viewedRound exists
        if (lg.viewedRound === undefined) lg.viewedRound = lg.currentRound;

        const container = document.getElementById('fixtures-container');
        const roundNumEl = document.getElementById('current-round-number');
        const controls = document.getElementById('simulation-controls');
        
        roundNumEl.textContent = lg.viewedRound + 1;
        container.innerHTML = '';

        if (lg.rounds[lg.viewedRound].date) {
            const dateStr = lg.rounds[lg.viewedRound].date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const dateEl = document.createElement('div');
            dateEl.style.fontSize = '0.75rem';
            dateEl.style.color = 'var(--text-secondary)';
            dateEl.style.textAlign = 'center';
            dateEl.style.marginBottom = '10px';
            dateEl.textContent = dateStr;
            container.appendChild(dateEl);
        }

        // Show/Hide simulation buttons if we are viewing the current simulation round
        if (lg.viewedRound === lg.currentRound && lg.currentRound < 38) {
            controls.style.display = 'block';
        } else {
            controls.style.display = 'none';
        }

        if (lg.viewedRound >= lg.rounds.length) {
            container.innerHTML = '<div style="text-align:center; padding: 2rem; color: var(--text-secondary);">Temporada Finalizada!</div>';
            return;
        }

        const matches = lg.rounds[lg.viewedRound].matches;
        const table = document.createElement('table');
        table.className = 'results-table';
        const tbody = document.createElement('tbody');

        matches.forEach(match => {
            const home = lg.teams.find(t => t.id === match.home);
            const away = lg.teams.find(t => t.id === match.away);
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="col-home team-clickable" onclick="simulator.showTeamDetails(${home.id})">${home.name}</td>
                <td class="col-score">${match.homeScore ?? '-'}</td>
                <td class="col-sep">X</td>
                <td class="col-score">${match.awayScore ?? '-'}</td>
                <td class="col-away team-clickable" onclick="simulator.showTeamDetails(${away.id})">${away.name}</td>
            `;
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        container.appendChild(table);
    }

    displayCalendar() {
        const lg = this.leagues[this.currentSerie];
        const container = document.getElementById('calendar-container');
        container.innerHTML = '';

        let currentMonth = -1;
        let monthSection = null;

        lg.rounds.forEach((round, index) => {
            const roundDate = round.date;
            const month = roundDate.getMonth();

            if (month !== currentMonth) {
                currentMonth = month;
                const monthName = roundDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();
                
                const monthHeader = document.createElement('div');
                monthHeader.className = 'month-header';
                monthHeader.style.padding = '1.5rem 0 1rem 0';
                monthHeader.style.borderBottom = '2px solid var(--accent)';
                monthHeader.style.color = 'var(--accent)';
                monthHeader.style.fontWeight = '800';
                monthHeader.style.fontSize = '1.2rem';
                monthHeader.style.marginTop = '2rem';
                monthHeader.textContent = monthName;
                container.appendChild(monthHeader);
            }

            const roundWrapper = document.createElement('div');
            roundWrapper.style.marginTop = '1.5rem';
            
            const roundTitle = document.createElement('div');
            roundTitle.style.display = 'flex';
            roundTitle.style.justifyContent = 'space-between';
            roundTitle.style.alignItems = 'center';
            roundTitle.style.padding = '5px 10px';
            roundTitle.style.background = 'rgba(255,255,255,0.05)';
            roundTitle.style.borderRadius = '5px';
            roundTitle.style.marginBottom = '10px';
            roundTitle.innerHTML = `
                <span style="font-weight: 700;">Rodada ${index + 1}</span>
                <span style="font-size: 0.8rem; color: var(--text-secondary);">${roundDate.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</span>
            `;
            roundWrapper.appendChild(roundTitle);

            const table = document.createElement('table');
            table.className = 'results-table';
            table.style.fontSize = '0.8rem';
            const tbody = document.createElement('tbody');

            round.matches.forEach(match => {
                const home = lg.teams.find(t => t.id === match.home);
                const away = lg.teams.find(t => t.id === match.away);
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td class="col-home team-clickable" onclick="simulator.showTeamDetails(${home.id})">${home.name}</td>
                    <td class="col-score">${match.homeScore ?? '-'}</td>
                    <td class="col-sep">X</td>
                    <td class="col-score">${match.awayScore ?? '-'}</td>
                    <td class="col-away team-clickable" onclick="simulator.showTeamDetails(${away.id})">${away.name}</td>
                `;
                tbody.appendChild(tr);
            });
            table.appendChild(tbody);
            roundWrapper.appendChild(table);
            container.appendChild(roundWrapper);
        });
    }

    updateStats() {
        const lg = this.leagues[this.currentSerie];
        let totalGoals = 0;
        let totalMatches = 0;
        
        lg.rounds.forEach(r => r.matches.forEach(m => {
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


    // --- CAREER MODE LOGIC ---

    startTeamSelection() {
        const grid = document.getElementById('selection-grid');
        grid.innerHTML = '';
        
        this.allTeamsRaw.sort((a,b) => b.strength - a.strength).forEach(team => {
            const card = document.createElement('div');
            card.className = 'player-card interactive';
            card.onclick = () => this.selectTeam(team.id);
            card.innerHTML = `
                <div style="font-size: 0.8rem; color: var(--fifa-cyan);">${team.serie === 'A' ? 'SÉRIE A' : 'SÉRIE B'}</div>
                <div style="font-size: 1.2rem; font-weight: 800; margin: 10px 0;">${team.name}</div>
                <div class="rating">${team.strength}</div>
                <div style="font-size: 0.7rem; margin-top: 10px; color: var(--text-secondary);">Orçamento: R$ 50M</div>
            `;
            grid.appendChild(card);
        });
        
        this.openScreen('team-selection');
    }

    selectTeam(teamId) {
        const team = this.allTeamsRaw.find(t => t.id === teamId);
        this.currentSerie = team.serie;
        this.career.active = true;
        this.career.team = this.leagues[this.currentSerie].teams.find(t => t.id === teamId);
        
        document.getElementById('user-team-name').textContent = team.name;
        document.getElementById('user-team-logo').style.backgroundColor = team.color;
        
        this.openScreen('career-hub');
        this.switchTab('central');
    }

    updateCareerDashboard() {
        const lg = this.leagues[this.currentSerie];
        const nextRound = lg.rounds[lg.currentRound];
        
        if (nextRound) {
            const userMatch = nextRound.matches.find(m => m.home === this.career.team.id || m.away === this.career.team.id);
            const opponentId = userMatch.home === this.career.team.id ? userMatch.away : userMatch.home;
            const opponent = lg.teams.find(t => t.id === opponentId);
            
            document.getElementById('next-opponent-name').textContent = `vs ${opponent.name}`;
            document.getElementById('match-details').textContent = `Rodada ${lg.currentRound + 1} - ${nextRound.date.toLocaleDateString('pt-BR')}`;
        } else {
            document.getElementById('next-opponent-name').textContent = `Fim da Temporada`;
        }

        document.getElementById('money-display').textContent = `R$ ${this.career.budget.toLocaleString('pt-BR')}`;
        document.getElementById('budget-info').textContent = `R$ ${(this.career.budget / 1000000).toFixed(0)}M`;
        
        this.renderMiniStandings();
    }

    renderMiniStandings() {
        const lg = this.leagues[this.currentSerie];
        const sorted = [...lg.teams].sort((a,b) => b.points - a.points);
        const userPos = sorted.findIndex(t => t.id === this.career.team.id) + 1;
        
        const container = document.getElementById('league-summary-mini');
        container.innerHTML = `
            <div style="display: flex; justify-content: space-between; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 5px;">
                <span>Sua Posição: <strong>${userPos}º</strong></span>
                <span>Pontos: <strong>${this.career.team.points}</strong></span>
            </div>
        `;
    }

    renderCareerSquad() {
        const t = this.career.team;
        const titContainer = document.getElementById('career-titulares');
        const resContainer = document.getElementById('career-reservas');
        
        titContainer.innerHTML = '';
        resContainer.innerHTML = '';
        
        t.roster.forEach(p => {
            const div = document.createElement('div');
            div.className = 'squad-slot';
            div.innerHTML = `
                <span><strong>${p.pos}</strong> ${p.name}</span>
                <span class="player-strength">${p.strength}</span>
            `;
            if (p.status === 'Titular') titContainer.appendChild(div);
            else resContainer.appendChild(div);
        });
    }

    renderMarket() {
        const grid = document.getElementById('market-display');
        const serie = document.getElementById('transfer-serie-filter').value;
        grid.innerHTML = '';
        
        const otherTeams = this.leagues[serie].teams.filter(t => t.id !== this.career.team.id);
        
        otherTeams.forEach(team => {
            team.roster.forEach(p => {
                const price = p.strength * 500000 + (Math.random() * 2000000);
                const card = document.createElement('div');
                card.className = 'player-card';
                card.innerHTML = `
                    <div style="font-size: 0.7rem; color: var(--text-secondary);">${team.name}</div>
                    <div style="font-weight: 700; margin: 5px 0;">${p.name}</div>
                    <div class="rating">${p.strength}</div>
                    <div style="color: var(--fifa-cyan); font-weight: 800; font-size: 0.8rem; margin: 10px 0;">R$ ${(price/1000000).toFixed(1)}M</div>
                    <button onclick="simulator.buyPlayer(${p.id}, ${team.id}, ${price})" style="padding: 5px; font-size: 0.7rem; margin: 0;">Contratar</button>
                `;
                grid.appendChild(card);
            });
        });
    }

    buyPlayer(playerId, fromTeamId, price) {
        if (this.career.budget < price) {
            alert("Orçamento insuficiente!");
            return;
        }

        const fromTeam = this.allTeamsRaw.find(t => t.id === fromTeamId);
        const playerIndex = fromTeam.roster.findIndex(p => p.id === playerId);
        const player = fromTeam.roster.splice(playerIndex, 1)[0];
        
        player.status = 'Reserva';
        this.career.team.roster.push(player);
        this.career.budget -= price;
        
        alert(`${player.name} contratado com sucesso!`);
        this.renderMarket();
        this.updateCareerDashboard();
    }

    renderCareerStandings() {
        const table = document.getElementById('career-standings');
        this.updateTable(); // Update raw data
        const originalTbody = document.getElementById('standings-body');
        table.innerHTML = `<thead>${document.querySelector('table thead').innerHTML}</thead>`;
        const newTbody = document.createElement('tbody');
        newTbody.innerHTML = originalTbody.innerHTML;
        table.appendChild(newTbody);
    }

    renderCareerFixtures() {
        const container = document.getElementById('career-calendar');
        this.displayCalendar();
        container.innerHTML = document.getElementById('calendar-container').innerHTML;
    }

    // --- FRIENDLY LOGIC ---

    setupFriendlySelects() {
        const homeSel = document.getElementById('friendly-home');
        const awaySel = document.getElementById('friendly-away');
        homeSel.innerHTML = '';
        awaySel.innerHTML = '';
        
        this.allTeamsRaw.sort((a,b) => a.name.localeCompare(b.name)).forEach(t => {
            const opt = `<option value="${t.id}">${t.name}</option>`;
            homeSel.innerHTML += opt;
            awaySel.innerHTML += opt;
        });
    }

    playFriendly() {
        const hId = parseInt(document.getElementById('friendly-home').value);
        const aId = parseInt(document.getElementById('friendly-away').value);
        
        const homeTeam = this.allTeamsRaw.find(t => t.id === hId);
        const awayTeam = this.allTeamsRaw.find(t => t.id === aId);
        
        const match = { home: hId, away: aId, homeScore: null, awayScore: null };
        
        // Use a temporary copy of teams for the simulation function to avoid affecting main league data
        const tempTeams = [JSON.parse(JSON.stringify(homeTeam)), JSON.parse(JSON.stringify(awayTeam))];
        this.simulateMatch(match, tempTeams);
        
        document.getElementById('friendly-result').innerHTML = `
            ${homeTeam.name} <span style="color: var(--fifa-cyan)">${match.homeScore}</span> X 
            <span style="color: var(--fifa-cyan)">${match.awayScore}</span> ${awayTeam.name}
        `;
    }

    showTeamDetails(teamId) {
        const team = this.allTeamsRaw.find(t => t.id === teamId);
        if (!team) return;

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
            let list = container.querySelector('.roster-list-inner');
            if (!list) {
                list = document.createElement('div');
                list.className = 'roster-list-inner';
                container.appendChild(list);
            }
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
