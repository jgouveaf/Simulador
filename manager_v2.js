import teamsData from './teams.js';

class BrasileiraoSimulator {
    constructor() {
        this.allTeamsRaw = teamsData;
        
        // Ensure every player has a unique ID for the transfer market
        let playerCounter = 1;
        this.allTeamsRaw.forEach(team => {
            team.roster.forEach(p => {
                if (!p.id) p.id = playerCounter++;
            });
            team.strength = this.calculateTeamOverall(team);
        });

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
                percentage: 0,
                strength: this.calculateTeamOverall(team)
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
        
        // Force initial screen to be main menu
        this.openScreen('main-menu');
        
        // Event Bindings
        document.getElementById('btn-start-career')?.addEventListener('click', () => this.startTeamSelection());
        document.getElementById('btn-start-friendly')?.addEventListener('click', () => this.openScreen('friendly-setup'));
        document.getElementById('btn-career-simulate')?.addEventListener('click', () => this.simulateRound());
        document.getElementById('btn-tab-standings')?.addEventListener('click', () => this.switchTab('standings'));
        document.getElementById('btn-play-friendly')?.addEventListener('click', () => this.playFriendly());
        document.getElementById('btn-close-modal')?.addEventListener('click', () => this.closeModal());
        
        document.querySelectorAll('.btn-back-main').forEach(btn => {
            btn.addEventListener('click', () => this.openScreen('main-menu'));
        });

        // Keyboard Shortcuts (D-Pad style)
        window.addEventListener('keydown', (e) => {
            if (document.getElementById('match-simulation-screen').classList.contains('active')) {
                this.handleMatchShortcuts(e);
            }
        });

        // Sub-Tab logic
        document.querySelectorAll('.sub-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const subId = tab.dataset.subtab;
                if (subId) this.switchSubTab(subId);
            });
        });

        // Tab switching logic
        document.querySelectorAll('.tab:not(.sub-tab)').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabId = tab.dataset.tab;
                document.querySelectorAll('.tab:not(.sub-tab)').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                if (tabId) this.switchTab(tabId);
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
        const target = document.getElementById(`tab-${tabId}`);
        if (!target) return;
        
        document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
        target.style.display = 'block';
        
        // Update tab UI
        document.querySelectorAll('.tab').forEach(t => {
            t.classList.remove('active');
            if (t.dataset.tab === tabId) t.classList.add('active');
        });

        if (tabId === 'standings') this.renderCareerStandings();
        if (tabId === 'fixtures') this.renderCareerFixtures();
        if (tabId === 'transfers') this.renderMarket();
        if (tabId === 'squad') {
            this.switchSubTab('roster');
            this.renderCareerSquad();
        }
    }

    switchSubTab(subTabId) {
        document.querySelectorAll('.sub-tab-content').forEach(c => c.style.display = 'none');
        document.getElementById(`subtab-${subTabId}`).style.display = 'block';

        document.querySelectorAll('.sub-tab').forEach(t => {
            t.classList.remove('active');
            if (t.dataset.subtab === subTabId) t.classList.add('active');
        });

        if (subTabId === 'roster') this.renderCareerSquad();
        if (subTabId === 'formation') this.renderFormation();
        if (subTabId === 'instructions') this.renderInstructions();
        if (subTabId === 'tactics') this.renderTactics();
        if (subTabId === 'roles') this.renderRoles();
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
        console.log("Simulating Round...");
        const lg = this.leagues[this.currentSerie];
        if (!lg || lg.currentRound >= lg.rounds.length) {
            console.log("Round finished or league error.");
            return;
        }

        const roundMatches = lg.rounds[lg.currentRound].matches;
        
        // Find user match
        let userMatch = null;
        if (this.career.active && this.career.team) {
            userMatch = roundMatches.find(m => m.home === this.career.team.id || m.away === this.career.team.id);
            console.log("Found user match for visual sim:", userMatch);
        }

        if (userMatch && !userMatch.simulated) {
            // Visually simulate user match
            const home = lg.teams.find(t => t.id === userMatch.home);
            const away = lg.teams.find(t => t.id === userMatch.away);
            
            if (home && away) {
                console.log("Starting visual sim:", home.name, "vs", away.name);
                this.startVisualSimulation(userMatch, home, away, () => {
                    console.log("Visual sim completed. Simulating others.");
                    roundMatches.forEach(m => {
                        if (m !== userMatch) this.simulateMatch(m, lg.teams);
                    });
                    
                    lg.currentRound++;
                    lg.viewedRound = lg.currentRound < 38 ? lg.currentRound : 37;
                    
                    this.updateTable();
                    this.displayRound();
                    this.updateStats();
                    this.displayCalendar();
                    if (this.career.active) this.updateCareerDashboard();
                });
            } else {
                console.error("Teams not found for visual sim!");
                // Fallback
                roundMatches.forEach(m => this.simulateMatch(m, lg.teams));
                lg.currentRound++;
                lg.viewedRound = lg.currentRound < 38 ? lg.currentRound : 37;
                this.updateTable();
                this.displayRound();
                this.updateStats();
                this.displayCalendar();
                if (this.career.active) this.updateCareerDashboard();
            }
        } else {
            console.log("Background simulation only.");
            roundMatches.forEach(m => this.simulateMatch(m, lg.teams));
            lg.currentRound++;
            lg.viewedRound = lg.currentRound < 38 ? lg.currentRound : 37;
            
            this.updateTable();
            this.displayRound();
            this.updateStats();
            this.displayCalendar();
            if (this.career.active) this.updateCareerDashboard();
        }
    }

    startVisualSimulation(match, home, away, callback) {
        console.log("Opening visual simulation screen...");
        this.openScreen('match-simulation');
        console.log("Screen active. Setting up UI...");
        
        // Setup UI
        document.getElementById('sim-home-name').textContent = home.name.toUpperCase();
        document.getElementById('sim-away-name').textContent = away.name.toUpperCase();
        document.getElementById('sim-home-logo').style.backgroundColor = home.color;
        document.getElementById('sim-away-logo').style.backgroundColor = away.color;
        document.getElementById('sim-score-value').textContent = "0 - 0";
        document.getElementById('sim-time-value').textContent = "00:00";
        
        // Setup Players
        const homeList = document.getElementById('sim-home-players');
        const awayList = document.getElementById('sim-away-players');
        homeList.innerHTML = '';
        awayList.innerHTML = '';
        
        const renderSimPlayers = (team, container) => {
            team.roster.filter(p => p.status === 'Titular').forEach(p => {
                const row = document.createElement('div');
                row.className = 'sim-player-row';
                row.innerHTML = `
                    <div class="sim-player-pos">${p.pos}</div>
                    <div class="sim-player-name">${p.name}</div>
                    <div class="sim-player-status"><div class="sim-player-bar"></div></div>
                `;
                container.appendChild(row);
            });
        };
        
        renderSimPlayers(home, homeList);
        renderSimPlayers(away, awayList);
        
        // Setup Pitch Dots
        const pitch = document.getElementById('sim-pitch-players');
        pitch.innerHTML = '';
        
        const createDots = (team, isHome) => {
            team.roster.filter(p => p.status === 'Titular').forEach((p, i) => {
                const dot = document.createElement('div');
                dot.className = 'player-dot';
                dot.style.backgroundColor = team.color;
                dot.style.left = isHome ? '25%' : '75%';
                dot.style.top = `${10 + (i * 8)}%`;
                dot.id = `player-dot-${p.id}`;
                pitch.appendChild(dot);
            });
        };
        
        createDots(home, true);
        createDots(away, false);
        
        // Pre-simulate the match result to know when goals happen
        // We pass [home, away] to ensure simulateMatch finds them regardless of league status
        const tempMatch = { ...match, homeScore: null, awayScore: null };
        this.simulateMatch(tempMatch, [home, away]);
        
        // Distribution of goals over time
        const goalEvents = [];
        for(let i=0; i<tempMatch.homeScore; i++) goalEvents.push({ team: 'home', min: Math.floor(Math.random() * 90) });
        for(let i=0; i<tempMatch.awayScore; i++) goalEvents.push({ team: 'away', min: Math.floor(Math.random() * 90) });
        
        let simMinute = 0;
        let homeScore = 0;
        let awayScore = 0;
        
        const ball = document.getElementById('sim-pitch-ball');
        
        const simInterval = setInterval(() => {
            simMinute++;
            document.getElementById('sim-time-value').textContent = `${simMinute.toString().padStart(2, '0')}:00`;
            
            // Random dot movement
            document.querySelectorAll('.player-dot').forEach(dot => {
                const noiseX = (Math.random() - 0.5) * 10;
                const noiseY = (Math.random() - 0.5) * 10;
                const currentLeft = parseFloat(dot.style.left);
                const currentTop = parseFloat(dot.style.top);
                
                // Keep them roughly in their half but moving
                let newLeft = currentLeft + (Math.random() - 0.5) * 5;
                let newTop = currentTop + (Math.random() - 0.5) * 5;
                
                if (newLeft < 5) newLeft = 5;
                if (newLeft > 95) newLeft = 95;
                if (newTop < 5) newTop = 5;
                if (newTop > 95) newTop = 95;
                
                dot.style.left = `${newLeft}%`;
                dot.style.top = `${newTop}%`;
            });
            
            // Ball movement (follow a random dot)
            const dots = document.querySelectorAll('.player-dot');
            const targetDot = dots[Math.floor(Math.random() * dots.length)];
            ball.style.left = targetDot.style.left;
            ball.style.top = targetDot.style.top;
            
            // Check for goals
            const goalsNow = goalEvents.filter(g => g.min === simMinute);
            goalsNow.forEach(g => {
                if (g.team === 'home') homeScore++;
                else awayScore++;
                
                document.getElementById('sim-score-value').textContent = `${homeScore} - ${awayScore}`;
                document.querySelector('.soccer-pitch').classList.add('goal-flash');
                setTimeout(() => document.querySelector('.soccer-pitch').classList.remove('goal-flash'), 1000);
                
                // Teleport ball to center after goal
                ball.style.left = '50%';
                ball.style.top = '50%';
            });
            
            if (simMinute >= 90) {
                clearInterval(simInterval);
                match.homeScore = homeScore;
                match.awayScore = awayScore;
                match.simulated = true;
                
                // IMPORTANT: Update league tables if not a friendly
                if (!match.isFriendly) {
                    const lg = this.leagues[this.currentSerie];
                    if (lg) this.updateLeagueStandings(match, lg.teams);
                }
                
                // Add a small delay then close
                setTimeout(() => {
                    callback();
                }, 2000);
            }
        }, 150); // Speed of sim

        // Skip button
        document.getElementById('btn-sim-skip').onclick = () => {
            clearInterval(simInterval);
            match.homeScore = tempMatch.homeScore;
            match.awayScore = tempMatch.awayScore;
            match.simulated = true;
            
            if (!match.isFriendly) {
                const lg = this.leagues[this.currentSerie];
                if (lg) this.updateLeagueStandings(match, lg.teams);
            }
            
            callback();
        };

        // Mentality Logic
        document.querySelectorAll('.btn-mentality').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.btn-mentality').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                match.currentMentality = btn.dataset.mentality;
                console.log("Mentality changed to:", match.currentMentality);
                // In a real sim, this would nudge the mean score calculation live
            };
        });

        // Quick Tactics
        document.querySelectorAll('.btn-quick-t').forEach(btn => {
            btn.onclick = () => {
                btn.classList.toggle('active-t');
                btn.style.borderColor = btn.classList.contains('active-t') ? 'var(--fifa-pink)' : 'var(--border)';
            };
        });
    }

    handleMatchShortcuts(e) {
        // Mentality (Left / Right)
        const mentalities = ['ultra-def', 'def', 'bal', 'atk', 'ultra-atk'];
        const currentBtn = document.querySelector('.btn-mentality.active');
        const currentIndex = mentalities.indexOf(currentBtn?.dataset.mentality || 'bal');

        if (e.key === 'ArrowLeft' && currentIndex > 0) {
            document.querySelector(`.btn-mentality[data-mentality="${mentalities[currentIndex - 1]}"]`).click();
        } else if (e.key === 'ArrowRight' && currentIndex < mentalities.length - 1) {
            document.querySelector(`.btn-mentality[data-mentality="${mentalities[currentIndex + 1]}"]`).click();
        }

        // Quick Tactics (Up / Down)
        if (e.key === 'ArrowUp') {
            document.querySelector('.btn-quick-t[title="Pressão Total"]').click();
        } else if (e.key === 'ArrowDown') {
            document.querySelector('.btn-quick-t[title="Subir Laterais"]').click();
        }
    }

    simulateSeason() {
        const lg = this.leagues[this.currentSerie];
        while (lg.currentRound < lg.rounds.length) {
            // Force background for whole season
            lg.rounds[lg.currentRound].matches.forEach(m => this.simulateMatch(m, lg.teams));
            lg.currentRound++;
        }
        lg.viewedRound = 37;
        this.updateTable();
        this.displayRound();
        this.updateStats();
        this.displayCalendar();
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
        if (!tbody) return; // Silent return if we are in a screen without the table
        
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
        if (!container) return; // Silent return
        
        const roundNumEl = document.getElementById('current-round-number');
        const controls = document.getElementById('simulation-controls');
        
        if (roundNumEl) roundNumEl.textContent = lg.viewedRound + 1;
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
        if (!container) return; // Silent return
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

        const totalGoalsEl = document.getElementById('total-goals');
        if (totalGoalsEl) totalGoalsEl.textContent = totalGoals;
        
        const avgGoalsEl = document.getElementById('avg-goals');
        if (avgGoalsEl) avgGoalsEl.textContent = totalMatches > 0 ? (totalGoals / totalMatches).toFixed(2) : '0';
        
        const roundProgressEl = document.getElementById('round-progress');
        if (roundProgressEl) roundProgressEl.textContent = `${lg.currentRound}/38`;
        
        const badge = document.getElementById('status-badge');
        if (badge) {
            if (lg.currentRound === 38) {
                badge.textContent = 'Temporada Encerrada';
                badge.style.color = 'var(--gold)';
            } else {
                badge.textContent = 'Em Andamento';
                badge.style.color = 'var(--accent)';
            }
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
        document.getElementById('user-team-overall').textContent = team.strength;
        
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
        document.getElementById('user-team-overall').textContent = this.career.team.strength;
        
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
        if (!t) return;

        const titContainer = document.getElementById('career-titulares');
        const resContainer = document.getElementById('career-reservas');
        const notContainer = document.getElementById('career-not-related');
        
        titContainer.innerHTML = '';
        resContainer.innerHTML = '';
        notContainer.innerHTML = '';
        
        document.getElementById('squad-overall-display').textContent = t.strength;
        
        // Atribuir status padrão se não houver
        if (t.roster.filter(p => p.status === 'Titular').length === 0) {
            t.roster.forEach((p, i) => {
                if (i < 11) p.status = 'Titular';
                else if (i < 18) p.status = 'Reserva';
                else p.status = 'Não Relacionado';
            });
        }

        t.roster.forEach(p => {
            const div = document.createElement('div');
            div.className = 'squad-slot player-item-interactive';
            if (this.selectedPlayerToSwap && this.selectedPlayerToSwap.id === p.id) {
                div.classList.add('selected-to-swap');
                div.style.borderColor = 'var(--fifa-cyan)';
                div.style.boxShadow = '0 0 10px var(--fifa-cyan)';
            }
            
            div.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span class="player-pos" style="font-size: 0.6rem;">${p.pos}</span>
                    <span style="font-size: 0.85rem; font-weight: 600;">${p.name}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 15px;">
                    <span class="player-strength" style="font-size: 0.8rem;">${p.strength}</span>
                    <button class="small-btn btn-swap-trigger" data-id="${p.id}" style="padding: 2px 8px; font-size: 0.6rem;">${this.selectedPlayerToSwap ? 'TROCAR' : 'SELEC.'}</button>
                </div>
            `;

            div.querySelector('.btn-swap-trigger').onclick = (e) => {
                e.stopPropagation();
                this.handlePlayerSwap(p);
            };

            if (p.status === 'Titular') titContainer.appendChild(div);
            else if (p.status === 'Reserva') resContainer.appendChild(div);
            else notContainer.appendChild(div);
        });
    }

    handlePlayerSwap(player) {
        if (!this.selectedPlayerToSwap) {
            this.selectedPlayerToSwap = player;
            this.renderCareerSquad();
            return;
        }

        if (this.selectedPlayerToSwap.id === player.id) {
            this.selectedPlayerToSwap = null;
            this.renderCareerSquad();
            return;
        }

        // Swap Logic
        const p1Status = this.selectedPlayerToSwap.status;
        const p2Status = player.status;

        // Limitações de escalação
        const team = this.career.team;
        const titularCount = team.roster.filter(p => p.status === 'Titular').length;
        const subCount = team.roster.filter(p => p.status === 'Reserva').length;

        // Se p1 é titular e p2 é reserva, ok.
        // Se p1 é titular e p2 é não relacionado por exemplo:
        this.selectedPlayerToSwap.status = p2Status;
        player.status = p1Status;

        // Recalculate strength after swap
        this.career.team.strength = this.calculateTeamOverall(this.career.team);

        this.selectedPlayerToSwap = null;
        this.renderCareerSquad();
    }

    renderFormation() {
        const pitch = document.getElementById('pitch-formation-display');
        pitch.innerHTML = '';
        
        const team = this.career.team;
        const formation = team.formation || '4-3-3';
        const titulares = team.roster.filter(p => p.status === 'Titular');
        
        // Ativar botão da formação atual
        document.querySelectorAll('.btn-formation').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.formation === formation);
            btn.onclick = () => {
                team.formation = btn.dataset.formation;
                this.renderFormation();
            };
        });

        const positions = this.getFormationCoordinates(formation);
        titulares.forEach((p, i) => {
            const coord = positions[i] || { x: 50, y: 50 };
            const div = document.createElement('div');
            div.className = 'pitch-player';
            div.style.left = `${coord.x}%`;
            div.style.top = `${coord.y}%`;
            div.innerHTML = `
                <span class="pos-label">${p.pos}</span>
                <span class="name-label">${p.name.split(' ').pop()}</span>
                <span style="font-size: 0.65rem; color: var(--gold);">${p.strength}</span>
            `;
            pitch.appendChild(div);
        });
    }

    getFormationCoordinates(formation) {
        // Base coordinates [0-100] for a 1.2 aspect pitch
        const base = {
            'GOL': { x: 50, y: 90 },
            'ZAG_L': { x: 35, y: 75 },
            'ZAG_R': { x: 65, y: 75 },
            'LD': { x: 85, y: 65 },
            'LE': { x: 15, y: 65 },
            'VOL': { x: 50, y: 60 },
            'MEI_L': { x: 30, y: 45 },
            'MEI_R': { x: 70, y: 45 },
            'MC': { x: 50, y: 40 },
            'ATA_L': { x: 25, y: 25 },
            'ATA_R': { x: 75, y: 25 },
            'ATA_C': { x: 50, y: 15 }
        };

        if (formation === '4-3-3') {
            return [
                {x: 50, y: 90}, // GOL
                {x: 15, y: 72}, {x: 35, y: 75}, {x: 65, y: 75}, {x: 85, y: 72}, // Defesa
                {x: 50, y: 55}, {x: 30, y: 42}, {x: 70, y: 42}, // Meio
                {x: 20, y: 20}, {x: 80, y: 20}, {x: 50, y: 15}  // Ataque
            ];
        } else if (formation === '4-4-2') {
            return [
                {x: 50, y: 90},
                {x: 10, y: 72}, {x: 35, y: 75}, {x: 65, y: 75}, {x: 90, y: 72},
                {x: 15, y: 45}, {x: 40, y: 48}, {x: 60, y: 48}, {x: 85, y: 45},
                {x: 40, y: 20}, {x: 60, y: 20}
            ];
        } else if (formation === '3-5-2') {
            return [
                {x: 50, y: 90},
                {x: 25, y: 75}, {x: 50, y: 78}, {x: 75, y: 75},
                {x: 10, y: 45}, {x: 35, y: 48}, {x: 50, y: 55}, {x: 65, y: 48}, {x: 90, y: 45},
                {x: 40, y: 20}, {x: 60, y: 20}
            ];
        }
        return Array(11).fill({x: 50, y: 50});
    }

    renderInstructions() {
        const pitch = document.getElementById('pitch-mini-instructions');
        const panel = document.getElementById('instruction-panel-details');
        pitch.innerHTML = '';
        
        const team = this.career.team;
        const titulares = team.roster.filter(p => p.status === 'Titular');
        const formation = team.formation || '4-3-3';
        const coords = this.getFormationCoordinates(formation);

        titulares.forEach((p, i) => {
            const c = coords[i];
            const div = document.createElement('div');
            div.className = 'pitch-player mini';
            div.style.left = `${c.x}%`;
            div.style.top = `${c.y}%`;
            div.style.width = '35px';
            div.style.height = '35px';
            div.innerHTML = `<span style="font-size: 0.5rem; font-weight: 900;">${p.pos}</span>`;
            
            div.onclick = () => {
                pitch.querySelectorAll('.pitch-player').forEach(d => d.style.borderColor = 'var(--fifa-cyan)');
                div.style.borderColor = '#fff';
                this.showPlayerInstructionControls(p);
            };
            
            pitch.appendChild(div);
        });
    }

    showPlayerInstructionControls(player) {
        const panel = document.getElementById('instruction-panel-details');
        player.instructions = player.instructions || {};

        let controlsHTML = `
            <div class="card" style="margin: 0; background: rgba(0,0,0,0.2);">
                <h4 style="color: var(--fifa-cyan); margin-bottom: 0.5rem;">${player.name}</h4>
                <p style="font-size: 0.7rem; margin-bottom: 1.5rem;">Posição: ${player.pos}</p>
        `;

        if (['LD', 'LE'].includes(player.pos)) {
            controlsHTML += `
                <div class="tactic-item">
                    <label>Apoio Ofensivo</label>
                    <select onchange="simulator.setInstruction(${player.id}, 'atk_support', this.value)">
                        <option value="balanced" ${player.instructions.atk_support === 'balanced' ? 'selected' : ''}>Equilibrado</option>
                        <option value="stay_back" ${player.instructions.atk_support === 'stay_back' ? 'selected' : ''}>Ficar na Defesa</option>
                        <option value="join_atk" ${player.instructions.atk_support === 'join_atk' ? 'selected' : ''}>Apoiar Ataque</option>
                    </select>
                </div>
            `;
        } else if (['VOL', 'MC'].includes(player.pos)) {
            controlsHTML += `
                <div class="tactic-item">
                    <label>Posicionamento Defensivo</label>
                    <select onchange="simulator.setInstruction(${player.id}, 'def_pos', this.value)">
                        <option value="center" ${player.instructions.def_pos === 'center' ? 'selected' : ''}>Cobrir Centro</option>
                        <option value="wing" ${player.instructions.def_pos === 'wing' ? 'selected' : ''}>Cobrir Lateral</option>
                    </select>
                </div>
            `;
        } else if (['ATA', 'CA'].includes(player.pos)) {
            controlsHTML += `
                <div class="tactic-item">
                    <label>Infiltração</label>
                    <select onchange="simulator.setInstruction(${player.id}, 'run_type', this.value)">
                        <option value="balanced" ${player.instructions.run_type === 'balanced' ? 'selected' : ''}>Equilibrado</option>
                        <option value="behind" ${player.instructions.run_type === 'behind' ? 'selected' : ''}>Chegar por Trás</option>
                        <option value="pivot" ${player.instructions.run_type === 'pivot' ? 'selected' : ''}>Pivô</option>
                    </select>
                </div>
            `;
        } else {
            controlsHTML += `<p style="font-size: 0.8rem; color: var(--text-secondary);">Sem instruções específicas para esta posição.</p>`;
        }

        controlsHTML += `</div>`;
        panel.innerHTML = controlsHTML;
    }

    setInstruction(playerId, key, value) {
        const p = this.career.team.roster.find(p => p.id === playerId);
        if (p) {
            p.instructions = p.instructions || {};
            p.instructions[key] = value;
        }
    }

    renderTactics() {
        const t = this.career.team;
        t.tactics = t.tactics || { def_width: 5, def_depth: 5, atk_style: 'balanced', atk_width: 5 };
        
        document.getElementById('tactics-def-width').value = t.tactics.def_width;
        document.getElementById('tactics-def-depth').value = t.tactics.def_depth;
        document.getElementById('tactics-atk-style').value = t.tactics.atk_style;
        document.getElementById('tactics-atk-width').value = t.tactics.atk_width;

        // Bind events
        ['def-width', 'def-depth', 'atk-width'].forEach(id => {
            const el = document.getElementById(`tactics-${id}`);
            el.oninput = () => {
                const key = id.replace('-', '_');
                t.tactics[key] = parseInt(el.value);
            };
        });
        
        document.getElementById('tactics-atk-style').onchange = (e) => {
            t.tactics.atk_style = e.target.value;
        };
    }

    renderRoles() {
        const team = this.career.team;
        const config = document.getElementById('roles-config');
        config.innerHTML = '';
        
        const roles = [
            { id: 'captain', label: 'Capitão' },
            { id: 'fk_short', label: 'Faltas Curtas' },
            { id: 'fk_long', label: 'Faltas Longas' },
            { id: 'penalty', label: 'Pênaltis' },
            { id: 'corner', label: 'Escanteios' }
        ];

        const titulares = team.roster.filter(p => p.status === 'Titular');

        roles.forEach(role => {
            const div = document.createElement('div');
            div.className = 'role-item';
            div.innerHTML = `
                <span class="role-label">${role.label}</span>
                <select class="role-select" onchange="simulator.setRole('${role.id}', this.value)">
                    ${titulares.map(p => `<option value="${p.id}" ${team.roles && team.roles[role.id] == p.id ? 'selected' : ''}>${p.name} (${p.strength})</option>`).join('')}
                </select>
            `;
            config.appendChild(div);
        });
    }

    setRole(roleId, playerId) {
        const team = this.career.team;
        team.roles = team.roles || {};
        team.roles[roleId] = playerId; 
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
        
        // Dynamic Overall Update
        this.career.team.strength = this.calculateTeamOverall(this.career.team);
        if (fromTeam) fromTeam.strength = this.calculateTeamOverall(fromTeam);
        
        alert(`${player.name} contratado com sucesso!`);
        this.renderMarket();
        this.updateCareerDashboard();
        this.updateTable(); // Sync all tables with new overalls
    }

    renderCareerStandings() {
        const table = document.getElementById('career-standings');
        if (!table) return;
        
        const lg = this.leagues[this.currentSerie];
        const sortedTeams = [...lg.teams].sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;
            if (b.won !== a.won) return b.won - a.won;
            if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
            return b.goalsFor - a.goalsFor;
        });

        table.innerHTML = `
            <thead>
                <tr>
                    <th class="pos">#</th>
                    <th>Time</th>
                    <th class="stats">P</th>
                    <th class="stats">J</th>
                    <th class="stats">V</th>
                    <th class="stats">E</th>
                    <th class="stats">D</th>
                    <th class="stats">GP</th>
                    <th class="stats">GC</th>
                    <th class="stats">SG</th>
                    <th class="stats">%</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;

        const tbody = table.querySelector('tbody');
        sortedTeams.forEach((team, index) => {
            const tr = document.createElement('tr');
            if (team.id === this.career.team.id) tr.style.background = 'rgba(0, 242, 255, 0.1)';
            
            tr.innerHTML = `
                <td class="pos">${index + 1}</td>
                <td>
                    <div class="team-name team-clickable" data-id="${team.id}">
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

        // Add team details listener to the names
        tbody.querySelectorAll('.team-clickable').forEach(el => {
            el.onclick = () => this.showTeamDetails(parseInt(el.dataset.id));
        });
    }

    renderCareerFixtures() {
        const container = document.getElementById('career-calendar');
        if (!container) return;
        container.innerHTML = '';
        
        const lg = this.leagues[this.currentSerie];
        let currentMonth = -1;

        lg.rounds.forEach((round, index) => {
            const roundDate = round.date;
            const month = roundDate.getMonth();

            if (month !== currentMonth) {
                currentMonth = month;
                const monthName = roundDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();
                const monthHeader = document.createElement('div');
                monthHeader.className = 'month-header';
                monthHeader.style.padding = '1rem 0 0.5rem 0';
                monthHeader.style.color = 'var(--fifa-cyan)';
                monthHeader.style.fontWeight = '800';
                monthHeader.style.fontSize = '1rem';
                monthHeader.style.marginTop = '1.5rem';
                monthHeader.style.borderBottom = '1px solid var(--border)';
                monthHeader.textContent = monthName;
                container.appendChild(monthHeader);
            }

            const roundWrapper = document.createElement('div');
            roundWrapper.style.marginTop = '1rem';
            roundWrapper.style.padding = '10px';
            roundWrapper.style.background = 'rgba(255,255,255,0.02)';
            roundWrapper.style.borderRadius = '8px';
            
            roundWrapper.innerHTML = `<div style="font-weight: 700; margin-bottom: 5px; font-size: 0.8rem;">Rodada ${index + 1}</div>`;

            round.matches.forEach(match => {
                const home = lg.teams.find(t => t.id === match.home);
                const away = lg.teams.find(t => t.id === match.away);
                const row = document.createElement('div');
                row.style.display = 'flex';
                row.style.justifyContent = 'space-between';
                row.style.fontSize = '0.75rem';
                row.style.padding = '3px 0';
                row.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
                row.innerHTML = `
                    <span style="width: 40%; text-align: left;">${home.name}</span>
                    <span style="width: 20%; text-align: center; color: var(--fifa-cyan); font-weight: 700;">${match.homeScore ?? '-'} X ${match.awayScore ?? '-'}</span>
                    <span style="width: 40%; text-align: right;">${away.name}</span>
                `;
                roundWrapper.appendChild(row);
            });
            container.appendChild(roundWrapper);
        });
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
        
        if (!homeTeam || !awayTeam) return;

        const match = { home: hId, away: aId, homeScore: null, awayScore: null, isFriendly: true };
        
        this.startVisualSimulation(match, homeTeam, awayTeam, () => {
            this.openScreen('friendly-setup');
            document.getElementById('friendly-result').innerHTML = `
                ${homeTeam.name} <span style="color: var(--fifa-cyan)">${match.homeScore}</span> X 
                <span style="color: var(--fifa-cyan)">${match.awayScore}</span> ${awayTeam.name}
            `;
        });
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

    calculateTeamOverall(team) {
        if (!team.roster || team.roster.length === 0) return 70;
        const titulares = team.roster.filter(p => p.status === 'Titular');
        if (titulares.length === 0) return team.strength || 70;
        
        const sum = titulares.reduce((acc, p) => acc + p.strength, 0);
        return Math.round(sum / 11); // Average of 11 starters
    }

    closeModal() {
        document.getElementById('team-modal').style.display = 'none';
    }
}

window.simulator = new BrasileiraoSimulator();
export default window.simulator;
