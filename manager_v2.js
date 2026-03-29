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

        // UI & Sim State
        this.isPaused = false;
        this.simInterval = null;
        this.queuedSubs = [];
        this.currentSimMatch = null;
        this.simCallback = null;
        this.tempSelected = null;
        this.selectionIndex = 0;
        this.selectionSerie = 'A';
        this.isSimulating = false; // Guard to prevent overlapping simulations
        this.simGeneration = 0;    // Unique ID for the current active simulation
        console.log('Brasileirao Manager V2.2 Loaded - FIFA Carousel & Santos Exception Active');

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
        document.getElementById('btn-sim-tactic-opener')?.addEventListener('click', () => this.openTacticalModal());
        
        document.querySelectorAll('.btn-back-main').forEach(btn => {
            btn.addEventListener('click', () => this.openScreen('main-menu'));
        });

        // Ensure Táctica button in simulation screen works
        document.addEventListener('click', (e) => {
            if (e.target.id === 'btn-sim-tactic-opener' || e.target.closest('#btn-sim-tactic-opener')) {
                this.openTacticalModal();
            }
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

        // DOM Ready check for additional listeners
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.bindDynamicListeners());
        } else {
            this.bindDynamicListeners();
        }
    }

    bindDynamicListeners() {
        // Tactic modal close
        document.querySelector('.close-tactical')?.addEventListener('click', () => this.closeTacticalModal());
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

    simulateMatch(match, leagueTeams, updateStats = true) {
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

        match.homeScore = Math.min(hScore, 8);
        match.awayScore = Math.min(aScore, 8);
 
        if (updateStats) this.updateLeagueStandings(match, leagueTeams);
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
        if (this.isSimulating) {
            console.log("Already simulating! Ignoring call.");
            return;
        }
        
        const card = document.getElementById('btn-career-simulate');
        if (card) {
            card.style.pointerEvents = 'none';
            card.style.opacity = '0.5';
        }

        console.log("Simulating Round...");
        const lg = this.leagues[this.currentSerie];
        if (!lg || lg.currentRound >= lg.rounds.length) {
            console.log("Round finished or league error.");
            return;
        }
        
        this.isSimulating = true;
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
                let completed = false;
                this.startVisualSimulation(userMatch, home, away, () => {
                    if (completed) return;
                    completed = true;
                    
                    if (card) {
                        card.style.pointerEvents = 'auto';
                        card.style.opacity = '1';
                    }
                    
                    this.isSimulating = false;
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
                    
                    // Return to career hub after simulation
                    this.openScreen('career-hub');
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
            this.isSimulating = false;
        }
    }

    startVisualSimulation(match, home, away, callback) {
        // INCREMENT GENERATION TO KILL PREVIOUS ZOMBIE INTERVALS
        this.simGeneration++;
        const currentGen = this.simGeneration;
        
        if (this.simInterval) {
            clearInterval(this.simInterval);
            this.simInterval = null;
        }
        this.currentSimHome = home;
        this.currentSimAway = away;
        this.openScreen('match-simulation');
        
        // Setup UI
        document.getElementById('sim-home-name').textContent = home.name.toUpperCase();
        document.getElementById('sim-away-name').textContent = away.name.toUpperCase();
        const simHomeLogo = document.getElementById('sim-home-logo');
        const simAwayLogo = document.getElementById('sim-away-logo');
        simHomeLogo.style.backgroundColor = home.color;
        simAwayLogo.style.backgroundColor = away.color;
        simHomeLogo.innerHTML = home.logo ? `<img src="${home.logo}" alt="${home.name}" style="width:100%;height:100%;object-fit:contain;padding:4px;">` : `<span style="font-size:0.9rem;font-weight:900;color:#fff;">${home.short||home.name.substring(0,3)}</span>`;
        simAwayLogo.innerHTML = away.logo ? `<img src="${away.logo}" alt="${away.name}" style="width:100%;height:100%;object-fit:contain;padding:4px;">` : `<span style="font-size:0.9rem;font-weight:900;color:#fff;">${away.short||away.name.substring(0,3)}</span>`;
        document.getElementById('sim-score-value').textContent = "0 - 0";
        document.getElementById('sim-time-value').textContent = "00:00";
        
        // Match State for this session
        match.usedSubs = 0;
        match.subLimit = 5;
        this.queuedSubs = [];

        const ticker = document.getElementById('sim-events-ticker');
        ticker.innerHTML = '<div class="sys-msg">Partida prestes a começar...</div>';
        
        // Match state for display
        match.events = match.events || []; // {type, min, player, team}

        const addMsg = (min, text, type = '', player = null) => {
            // ONLY ADD MESSAGE IF WE ARE IN THE CURRENT GENERATION
            if (this.simGeneration !== currentGen) return;
            
            if (player) {
                match.events.push({ type: type, min: min, player: player, team: player.team || (text.includes(home.name) ? home.name : away.name) });
            }

            const entry = document.createElement('div');
            entry.className = `event-entry ${type}`;
            entry.innerHTML = `
                <div class="event-time">${min}'</div>
                <div class="event-text">${text}</div>
            `;
            ticker.appendChild(entry);
            ticker.scrollTop = ticker.scrollHeight;
        };
              const attackPhrases = ["{team} ataca com perigo!", "{team} troca passes no campo ofensivo.", "Chance clara para o {team}!", "Pressão total do {team}!", "Cruzamento na área do {team}!", "{team} tenta o chute de longe!"];
        const genericPhrases = ["Jogo disputado no meio de campo.", "Muita marcação de ambos os lados.", "Posse de bola equilibrada.", "Partida truncada até agora.", "Torcida canta alto no estádio!"];
        const foulPhrases = ["Falta marcada para o {team}.", "Jogo parado. Falta do {team}.", "Cartão amarelo mostrado para o {team}!", "Infração do {team} no setor defensivo."];

        const tempMatch = { ...match, homeScore: null, awayScore: null };
        this.simulateMatch(tempMatch, [home, away], false);
        
        const goalEvents = [];
        for(let i=0; i<tempMatch.homeScore; i++) goalEvents.push({ team: home.name, min: Math.floor(Math.random() * 88) + 1 });
        for(let i=0; i<tempMatch.awayScore; i++) goalEvents.push({ team: away.name, min: Math.floor(Math.random() * 88) + 1 });
        
        let simMinute = 0;
        let homeScore = 0;
        let awayScore = 0;
        this.isPaused = false;
        this.currentSimMatch = match;
        this.simCallback = callback;

        const runSimTick = () => {
            if (this.simGeneration !== currentGen || match.simulated) {
                if (localIntervalId) clearInterval(localIntervalId);
                return;
            }

            if (this.isPaused) return;

            simMinute++;
            const timeEl = document.getElementById('sim-time-value');
            if (timeEl) timeEl.textContent = `${simMinute.toString().padStart(2, '0')}:00`;
            
            if (simMinute === 1) addMsg(1, "Apita o árbitro! Começa a partida.", "sys-msg");
            
            // Random Cards
            if (Math.random() < 0.035) {
                const team = Math.random() < 0.5 ? home : away;
                const p = team.roster.filter(p => p.status === 'Titular')[Math.floor(Math.random() * 11)];
                addMsg(simMinute, `CARTÃO AMARELO para ${p.name} (${team.name})!`, "warning", {name: p.name, id: p.id, type: 'card'});
            }

            // Subs
            if (this.queuedSubs.length > 0 && Math.random() < 0.3) {
                this.processQueuedSubs(home, away, addMsg, simMinute);
            }

            // Half-time Pause Logic
            if (simMinute === 45) {
                this.pauseSim();
                addMsg(45, "Intervalo de jogo!", "sys-msg");
                const btn = document.getElementById('btn-next-half');
                if (btn) {
                    btn.style.display = 'block';
                    btn.onclick = () => {
                        btn.style.display = 'none';
                        this.unpauseSim();
                        addMsg(45, "Começa o segundo tempo!", "sys-msg");
                    };
                }
            }

            if (this.isPaused) return;

            const goalsNow = goalEvents.filter(g => g.min === simMinute);
            goalsNow.forEach(g => {
                const team = (g.team === home.name) ? home : away;
                const p = team.roster.filter(p => p.status === 'Titular')[Math.floor(Math.random() * 11)];
                
                if (g.team === home.name) homeScore++;
                else awayScore++;
                
                const scoreEl = document.getElementById('sim-score-value');
                if (scoreEl) scoreEl.textContent = `${homeScore} - ${awayScore}`;
                
                addMsg(simMinute, `<strong>GOOOOOL DO ${g.team.toUpperCase()}!!</strong> ${p.name} balança as redes!`, "goal", {name: p.name, id: p.id, type: 'goal'});
            });

            if (goalsNow.length === 0 && Math.random() < 0.1) {
                const rand = Math.random();
                if (rand < 0.4) {
                    const t = Math.random() < 0.5 ? home : away;
                    const p = attackPhrases[Math.floor(Math.random() * attackPhrases.length)].replace('{team}', t.name);
                    addMsg(simMinute, p);
                } else if (rand < 0.6) {
                    const t = Math.random() < 0.5 ? home : away;
                    const p = foulPhrases[Math.floor(Math.random() * foulPhrases.length)].replace('{team}', t.name);
                    addMsg(simMinute, p, "warning");
                } else {
                    addMsg(simMinute, genericPhrases[Math.floor(Math.random() * genericPhrases.length)]);
                }
            }

            if (simMinute >= 90 && !match.simulated) {
                match.simulated = true; 
                if (localIntervalId) clearInterval(localIntervalId);
                this.simInterval = null;
                
                addMsg(90, "Fim de jogo!", "sys-msg");
                match.homeScore = homeScore;
                match.awayScore = awayScore;
                
                if (!match.isFriendly) {
                    const lg = this.leagues[this.currentSerie];
                    if (lg) this.updateLeagueStandings(match, lg.teams);
                }
                setTimeout(() => callback(), 2000);
            }
        };

        const localIntervalId = setInterval(runSimTick, 450);
        this.simInterval = localIntervalId; 

        // Sidebar lists
        const renderSimPlayers = (team, container) => {
            if (!container) return;
            container.innerHTML = '';
            team.roster.filter(p => p.status === 'Titular').forEach(p => {
                const row = document.createElement('div');
                row.className = 'sim-player-row';
                row.innerHTML = `<div class="sim-player-pos">${p.pos}</div><div class="sim-player-name">${p.name}</div>`;
                container.appendChild(row);
            });
        };
        renderSimPlayers(home, document.getElementById('sim-home-players'));
        renderSimPlayers(away, document.getElementById('sim-away-players'));

        // Skip button
        const skipBtn = document.getElementById('btn-sim-skip');
        if (skipBtn) {
            skipBtn.onclick = (e) => {
                e.preventDefault();
                // Ensure the skip ONLY works for the current generation
                if (this.simGeneration !== currentGen || match.simulated) return;
                match.simulated = true;
                
                console.log("Skipping simulation for generation:", currentGen);
                if (localIntervalId) clearInterval(localIntervalId);
                this.simInterval = null;
                
                match.homeScore = tempMatch.homeScore;
                match.awayScore = tempMatch.awayScore;
                
                if (!match.isFriendly) {
                    const lg = this.leagues[this.currentSerie];
                    if (lg) this.updateLeagueStandings(match, lg.teams);
                }
                
                callback();
            };
        }

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

        // Sim Nav Logic (Stats / Notes)
        const btnStats = document.getElementById('btn-sim-stats');
        const btnNotes = document.getElementById('btn-sim-notes');
        
        btnStats?.addEventListener('click', () => {
            btnStats.classList.add('active');
            btnNotes?.classList.remove('active');
            document.getElementById('sim-events-ticker').style.display = 'block';
            const notesPanel = document.getElementById('sim-notes-panel');
            if (notesPanel) notesPanel.style.display = 'none';
        });

        btnNotes?.addEventListener('click', () => {
            btnNotes.classList.add('active');
            btnStats?.classList.remove('active');
            document.getElementById('sim-events-ticker').style.display = 'none';
            this.renderSimNotes();
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

    pauseSim() {
        this.isPaused = true;
    }

    unpauseSim() {
        this.isPaused = false;
    }

    openTacticalModal() {
        // Guard: only open if we are inside an active visual simulation
        if (!this.currentSimHome || !this.currentSimAway) {
            console.warn('openTacticalModal: no active simulation, ignoring.');
            return;
        }
        this.pauseSim();
        this.renderSimTactics();
        const modal = document.getElementById('match-tactical-modal');
        if (modal) modal.style.display = 'block';
    }

    closeTacticalModal() {
        const modal = document.getElementById('match-tactical-modal');
        if (modal) modal.style.display = 'none';
        this.selectedInSimMatch = null;
        if (this.currentSimHome) this.unpauseSim();
    }

    renderSimTactics() {
        const match = this.currentSimMatch;
        // Find user team
        let team = null;
        if (!this.currentSimHome) return; 

        if (this.career.active && this.career.team) {
            if (this.currentSimHome.id === this.career.team.id) team = this.currentSimHome;
            else if (this.currentSimAway && this.currentSimAway.id === this.career.team.id) team = this.currentSimAway;
        }
        if (!team) team = this.currentSimHome;

        // INJECT FORMATION BUTTONS IN MODAL HEADER (if not there)
        const modalHeader = document.querySelector('#match-tactical-modal .fifa-header');
        if (modalHeader && !modalHeader.querySelector('.sim-formation-controls')) {
            const div = document.createElement('div');
            div.className = 'sim-formation-controls';
            div.style.display = 'flex';
            div.style.gap = '5px';
            div.style.marginLeft = '20px';
            ['4-3-3', '4-4-2', '3-5-2', '5-3-2', '4-2-3-1'].forEach(f => {
                const b = document.createElement('button');
                b.className = 'badge';
                b.style.fontSize = '0.6rem';
                b.textContent = f;
                b.onclick = () => {
                    team.formation = f;
                    this.renderSimTactics();
                };
                div.appendChild(b);
            });
            modalHeader.appendChild(div);
        }

        const pitch = document.getElementById('sim-tactical-board');
        const list = document.getElementById('sim-reserva-list');
        if (!pitch || !list) return;

        pitch.innerHTML = '';
        list.innerHTML = '';

        const formation = team.formation || '4-3-3';
        const coords = this.getFormationCoordinates(formation);
        const starters = team.roster.filter(p => p.status === 'Titular');
        const bench = team.roster.filter(p => p.status === 'Reserva');

        starters.forEach((p, i) => {
            const pos = coords[i] || { x: 50, y: 50 };
            const marker = document.createElement('div');
            marker.className = 'tactical-player';
            if (this.selectedInSimMatch && this.selectedInSimMatch.id === p.id) marker.classList.add('selected');
            
            marker.style.left = `${pos.x}%`;
            marker.style.top = `${pos.y}%`;
            marker.style.transform = 'translate(-50%, -50%) scale(0.85)';

            const pGoals = (match.events || []).filter(e => e.type === 'goal' && e.player.id === p.id).length;
            const hasCard = (match.events || []).some(e => e.type === 'warning' && e.player.id === p.id);

            marker.innerHTML = `
                <div class="player-circle">${p.strength}</div>
                <div class="player-name-tag">
                    ${p.name.split(' ').pop()} ${this.isQueued(p.id) ? '⏳' : ''}
                    ${pGoals > 0 ? `<span class="event-mini-icon icon-goal">⚽${pGoals > 1 ? pGoals : ''}</span>` : ''}
                    ${hasCard ? `<span class="event-mini-icon icon-card">🟨</span>` : ''}
                </div>
                <div style="font-size: 0.5rem; font-weight: 800; color: var(--fifa-cyan);">${pos.pos || p.pos}</div>
            `;

            marker.onclick = (e) => {
                e.stopPropagation();
                this.handleSimTacticalClick(p, team);
            };
            pitch.appendChild(marker);
        });

        bench.forEach(p => {
            const div = document.createElement('div');
            div.className = `squad-slot interactive ${this.selectedInSimMatch && this.selectedInSimMatch.id === p.id ? 'selected-to-swap' : ''}`;
            div.style.padding = '8px';
            div.style.marginBottom = '5px';
            div.style.borderLeft = this.isQueued(p.id) ? '4px solid var(--gold)' : '4px solid gray';
            
            div.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 0.8rem;"><strong>${p.pos}</strong> ${p.name}</span>
                    <span class="rating" style="font-size: 0.7rem;">${p.strength}</span>
                </div>
            `;
            div.onclick = () => this.handleSimTacticalClick(p, team);
            list.appendChild(div);
        });
    }

    handleSimTacticalClick(player, team) {
        if (!this.selectedInSimMatch) {
            this.selectedInSimMatch = player;
        } else {
            if (this.selectedInSimMatch.id === player.id) {
                this.selectedInSimMatch = null;
            } else {
                if (this.selectedInSimMatch.status !== player.status) {
                    const sub = {
                        team: team,
                        out: this.selectedInSimMatch.status === 'Titular' ? this.selectedInSimMatch : player,
                        in: this.selectedInSimMatch.status === 'Titular' ? player : this.selectedInSimMatch
                    };
                    
                    if (sub.out.status === 'Titular' && sub.in.status === 'Reserva') {
                        // CHECK SUB LIMIT
                        const match = this.currentSimMatch;
                        if (match.usedSubs + this.queuedSubs.length < match.subLimit) {
                            this.queuedSubs.push(sub);
                        } else {
                            alert(`Limite de ${match.subLimit} substituições atingido!`);
                        }
                    } else {
                        alert("Selecione um TITULAR (no campo) e um RESERVA (na lista) para substituir.");
                    }
                } else if (this.selectedInSimMatch.status === 'Titular' && player.status === 'Titular') {
                    // Position swap
                    const idx1 = team.roster.findIndex(p => p.id === this.selectedInSimMatch.id);
                    const idx2 = team.roster.findIndex(p => p.id === player.id);
                    const temp = team.roster[idx1];
                    team.roster[idx1] = team.roster[idx2];
                    team.roster[idx2] = temp;
                }
                this.selectedInSimMatch = null;
            }
        }
        this.renderSimTactics();
    }

    processQueuedSubs(home, away, addMsg, min) {
        this.queuedSubs.forEach(sub => {
            const team = sub.team;
            const pOut = team.roster.find(p => p.id === sub.out.id);
            const pIn = team.roster.find(p => p.id === sub.in.id);
            
            if (pOut && pIn) {
                pOut.status = 'Reserva';
                pIn.status = 'Titular';
                this.currentSimMatch.usedSubs++;
                addMsg(min, `SUBSTITUIÇÃO no ${team.name.toUpperCase()}: Sai ${pOut.name}, entra ${pIn.name}.`);
            }
        });
        
        this.queuedSubs = [];
        this.renderSimPlayerLists(home, away);
    }

    renderSimPlayerLists(home, away) {
        const renderList = (team, containerId) => {
            const container = document.getElementById(containerId);
            if (!container) return;
            container.innerHTML = '';
            team.roster.filter(p => p.status === 'Titular').forEach(p => {
                const row = document.createElement('div');
                row.className = 'sim-player-row';
                row.innerHTML = `<div class="sim-player-pos">${p.pos}</div><div class="sim-player-name">${p.name}</div>`;
                container.appendChild(row);
            });
        };
        renderList(home, 'sim-home-players');
        renderList(away, 'sim-away-players');
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
        if (!tbody) return; 
        
        tbody.innerHTML = '';

        sortedTeams.forEach((team, index) => {
            const tr = document.createElement('tr');
            
            // TNT Zone Logic
            let zone = "";
            if (index < 4) zone = "libertadores";
            else if (index < 6) zone = "pre-libertadores";
            else if (index < 12) zone = "sul-americana";
            else if (index >= 16) zone = "rebaixados";
            
            tr.setAttribute('data-zone', zone);
            
            tr.innerHTML = `
                <td class="pos">${index + 1}</td>
                <td>
                    <div class="team-cell team-clickable" onclick="simulator.showTeamDetails(${team.id})">
                        ${team.logo ? `<img src="${team.logo}" class="team-logo-small">` : `<div style="width:24px;height:24px;background:${team.color};border-radius:50%"></div>`}
                        ${team.name}
                    </div>
                </td>
                <td class="pts-cell">${team.points}</td>
                <td class="stats-cell">${team.played}</td>
                <td class="stats-cell">${team.won}</td>
                <td class="stats-cell">${team.goalDiff}</td>
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

    startTeamSelection(serie = 'A') {
        this.selectionSerie = serie;
        this.selectionIndex = 0;
        this.openScreen('team-selection');
        this.renderTeamSelection();
    }

    renderTeamSelection() {
        const grid = document.getElementById('selection-grid');
        const teams = this.allTeamsRaw.filter(t => t.serie === this.selectionSerie);
        const team = teams[this.selectionIndex];
        const stats = this.calculateDetailedStats(team);
        const starHTML = this.getStarRatingHTML(team);

        grid.innerHTML = `
            <div class="team-picker-container">
                <div class="serie-selector">
                    <button class="${this.selectionSerie === 'A' ? 'active' : ''}" onclick="simulator.changeSelectionSerie('A')">SÉRIE A</button>
                    <button class="${this.selectionSerie === 'B' ? 'active' : ''}" onclick="simulator.changeSelectionSerie('B')">SÉRIE B</button>
                </div>
                
                <div class="picker-main">
                    <button class="nav-arrow" onclick="simulator.navigateTeamSelection(-1)">❮</button>
                    
                    <div class="team-showcase">
                        <div class="team-logo-big" style="display:flex; align-items:center; justify-content:center;">
                            ${team.logo ? `<img src="${team.logo}" alt="${team.name}" style="width:140px; height:140px; object-fit:contain; filter:drop-shadow(0 4px 10px rgba(0,0,0,0.5));">` : `<span style="font-size: 4rem; font-weight: 900; color: #fff;">${team.name.substring(0,2)}</span>`}
                        </div>
                        <h2 class="team-name-selection">${team.name.toUpperCase()}</h2>
                        <div class="stars-container">${starHTML}</div>
                        
                        <div class="team-stats-selection">
                            <div class="stat-box">
                                <small>ATT</small>
                                <strong>${stats.att}</strong>
                            </div>
                            <div class="stat-box">
                                <small>MID</small>
                                <strong>${stats.mid}</strong>
                            </div>
                            <div class="stat-box">
                                <small>DEF</small>
                                <strong>${stats.def}</strong>
                            </div>
                        </div>
                    </div>
                    
                    <button class="nav-arrow" onclick="simulator.navigateTeamSelection(1)">❯</button>
                </div>
                
                <button class="btn-fifa-select" onclick="simulator.selectTeam('${team.id}')">ESCOLHER TIME</button>
            </div>
        `;
    }

    changeSelectionSerie(s) {
        this.selectionSerie = s;
        this.selectionIndex = 0;
        this.renderTeamSelection();
    }

    navigateTeamSelection(dir) {
        const teams = this.allTeamsRaw.filter(t => t.serie === this.selectionSerie);
        this.selectionIndex = (this.selectionIndex + dir + teams.length) % teams.length;
        this.renderTeamSelection();
    }

    getStarRatingHTML(team) {
        const ovr = team.strength;
        let stars = 0;

        // Exception for User Requested Ratings
        if (team.name === 'Flamengo' || team.id == 5) {
            stars = 5;
        } else if (team.name === 'Cruzeiro' || team.id == 19) {
            stars = 4.5;
        } else {
            if (ovr >= 92) stars = 5;
            else if (ovr >= 88) stars = 4.5;
            else if (ovr >= 83) stars = 4;
            else if (ovr >= 77) stars = 3.5;
            else if (ovr >= 73) stars = 3;
            else stars = 2.5;
        }

        let html = '';
        for (let i = 1; i <= 5; i++) {
            if (i <= Math.floor(stars)) html += '<i class="fas fa-star" style="color:var(--gold);"></i>';
            else if (i === Math.ceil(stars) && stars % 1 !== 0) html += '<i class="fas fa-star-half-alt" style="color:var(--gold);"></i>';
            else html += '<i class="far fa-star" style="color:gray;"></i>';
        }
        return html;
    }

    calculateDetailedStats(team) {
        const query = (positions) => {
            const list = team.roster.filter(p => p.status === 'Titular' && positions.includes(p.pos));
            if (list.length === 0) return team.strength || 70;
            return Math.round(list.reduce((acc, p) => acc + p.strength, 0) / list.length);
        };
        
        return {
            att: query(['PE', 'PD', 'ATA', 'CA', 'ST']),
            mid: query(['VOL', 'MC', 'MEI', 'MD', 'ME']),
            def: query(['GK', 'GOL', 'ZAG', 'LD', 'LE', 'ALA'])
        };
    }

    selectTeam(teamId) {
        const team = this.allTeamsRaw.find(t => t.id == teamId);
        this.currentSerie = team.serie;
        this.career.active = true;
        this.career.team = this.leagues[this.currentSerie].teams.find(t => t.id == teamId);
        
        document.getElementById('user-team-name').textContent = team.name;
        const logoEl = document.getElementById('user-team-logo');
        logoEl.style.backgroundColor = team.color;
        if (team.logo) {
            logoEl.innerHTML = `<img src="${team.logo}" alt="${team.name}" style="width:40px; height:40px; object-fit:contain;">`;
        } else {
            logoEl.innerHTML = '';
        }
        document.getElementById('user-team-overall').innerHTML = this.getStarRatingHTML(team);
        
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
        document.getElementById('user-team-overall').innerHTML = this.getStarRatingHTML(this.career.team);
        
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
        const pitch = document.getElementById('pitch-tactical-board');
        if (!pitch) return;
        pitch.innerHTML = '';
        
        const team = this.career.team;
        if (!team) return;
        
        const formation = team.formation || '4-3-3';
        const titulares = team.roster.filter(p => p.status === 'Titular');
        
        // Ativar botões de formação
        document.querySelectorAll('.btn-formation').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.formation === formation);
            btn.onclick = () => {
                team.formation = btn.dataset.formation;
                this.renderFormation();
                this.renderCareerSquad();
            };
        });

        const coords = this.getFormationCoordinates(formation);
        
        titulares.forEach((p, i) => {
            const pos = coords[i] || { x: 50, y: 50 };
            const marker = document.createElement('div');
            marker.className = 'tactical-player';
            if (this.selectedInTactics && this.selectedInTactics.id === p.id) marker.classList.add('selected');
            
            marker.style.left = `${pos.x}%`;
            marker.style.top = `${pos.y}%`;
            marker.style.transform = 'translate(-50%, -50%)';
            
            marker.innerHTML = `
                <div class="player-circle">${p.strength}</div>
                <div class="player-name-tag">${p.name.split(' ').pop()}</div>
                <div style="font-size: 0.5rem; font-weight: 800; color: var(--fifa-cyan); text-transform: uppercase;">${pos.pos || p.pos}</div>
            `;

            marker.onclick = (e) => {
                e.stopPropagation();
                this.handleTacticalSwap(p);
            };

            pitch.appendChild(marker);
        });

        // Add empty "drop spots" logic? No, let's stick to player-to-player swap
    }

    handleTacticalSwap(player) {
        if (!this.selectedInTactics) {
            this.selectedInTactics = player;
        } else {
            if (this.selectedInTactics.id !== player.id) {
                const team = this.career.team;
                const idx1 = team.roster.findIndex(p => p.id === this.selectedInTactics.id);
                const idx2 = team.roster.findIndex(p => p.id === player.id);
                
                // Swap in the actual roster array to change their order in the starter group
                const temp = team.roster[idx1];
                team.roster[idx1] = team.roster[idx2];
                team.roster[idx2] = temp;
                
                // Position logic: they essentially swap positions in the formation coordinates
                this.renderCareerSquad();
            }
            this.selectedInTactics = null;
        }
        this.renderFormation();
    }

    getFormationCoordinates(f) {
        const map = {
            '4-4-2': [
                {x:50, y:88, pos:'GK'},
                {x:20, y:68, pos:'LD'}, {x:40, y:72, pos:'ZAG'}, {x:60, y:72, pos:'ZAG'}, {x:80, y:68, pos:'LE'},
                {x:20, y:45, pos:'MD'}, {x:40, y:45, pos:'MC'}, {x:60, y:45, pos:'MC'}, {x:80, y:45, pos:'ME'},
                {x:40, y:18, pos:'ATA'}, {x:60, y:18, pos:'ST'}
            ],
            '4-3-3': [
                {x:50, y:88, pos:'GK'},
                {x:20, y:68, pos:'LD'}, {x:40, y:72, pos:'ZAG'}, {x:60, y:72, pos:'ZAG'}, {x:80, y:68, pos:'LE'},
                {x:30, y:45, pos:'MC'}, {x:50, y:50, pos:'MC'}, {x:70, y:45, pos:'MC'},
                {x:20, y:18, pos:'PE'}, {x:50, y:12, pos:'ATA'}, {x:80, y:18, pos:'PD'}
            ],
            '3-5-2': [
                {x:50, y:88, pos:'GK'},
                {x:25, y:72, pos:'ZAG'}, {x:50, y:76, pos:'ZAG'}, {x:75, y:72, pos:'ZAG'},
                {x:12, y:45, pos:'ALA'}, {x:35, y:48, pos:'VOL'}, {x:50, y:52, pos:'MC'}, {x:65, y:48, pos:'VOL'}, {x:88, y:45, pos:'ALA'},
                {x:40, y:18, pos:'ATA'}, {x:60, y:18, pos:'ST'}
            ],
            '5-3-2': [
                {x:50, y:88, pos:'GK'},
                {x:12, y:68, pos:'LD'}, {x:32, y:72, pos:'ZAG'}, {x:50, y:76, pos:'ZAG'}, {x:68, y:72, pos:'ZAG'}, {x:88, y:68, pos:'LE'},
                {x:30, y:45, pos:'MC'}, {x:50, y:50, pos:'MC'}, {x:70, y:45, pos:'MC'},
                {x:40, y:18, pos:'ATA'}, {x:60, y:18, pos:'ST'}
            ],
            '4-2-3-1': [
                {x:50, y:88, pos:'GK'},
                {x:20, y:68, pos:'LD'}, {x:40, y:72, pos:'ZAG'}, {x:60, y:72, pos:'ZAG'}, {x:80, y:68, pos:'LE'},
                {x:40, y:48, pos:'VOL'}, {x:60, y:48, pos:'VOL'},
                {x:20, y:28, pos:'MD'}, {x:50, y:32, pos:'MEI'}, {x:80, y:28, pos:'ME'},
                {x:50, y:12, pos:'ST'}
            ]
        };
        return map[f] || map['4-3-3'];
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

        if (this.isSimulating) {
            console.log("Friendly simulation already in progress.");
            return;
        }
        this.isSimulating = true;
        
        const btn = document.getElementById('btn-play-friendly');
        if (btn) {
            btn.disabled = true;
            btn.style.opacity = '0.5';
        }

        const match = { home: hId, away: aId, homeScore: null, awayScore: null, isFriendly: true };
        
        let completed = false;
        this.startVisualSimulation(match, homeTeam, awayTeam, () => {
            if (completed) return;
            completed = true;
            
            this.isSimulating = false;
            if (btn) {
                btn.disabled = false;
                btn.style.opacity = '1';
            }
            this.openScreen('friendly-setup');
            document.getElementById('friendly-result').innerHTML = `
                ${homeTeam.name} <span style="color: var(--fifa-cyan)">${match.homeScore}</span> X 
                <span style="color: var(--fifa-cyan)">${match.awayScore}</span> ${awayTeam.name}
            `;
        });
    }

    renderSimNotes() {
        const center = document.querySelector('.sim-pitch-area');
        let panel = document.getElementById('sim-notes-panel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'sim-notes-panel';
            panel.style.padding = '20px';
            panel.style.overflowY = 'auto';
            panel.style.height = '100%';
            panel.style.background = 'rgba(0,0,0,0.4)';
            center.appendChild(panel);
        }
        panel.style.display = 'block';
        
        const home = this.currentSimHome;
        const away = this.currentSimAway;
        
        const renderGroup = (team, color) => {
            return team.roster.filter(p => p.status === 'Titular').map(p => `
                <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <span style="font-size: 0.85rem;"><strong>${p.pos}</strong> ${p.name}</span>
                    <span class="rating" style="background: ${color}; font-size: 0.8rem;">${p.strength}</span>
                </div>
            `).join('');
        };

        panel.innerHTML = `
            <h2 style="text-align: center; margin-bottom: 2rem; color: var(--gold); border-bottom: 1px solid var(--border); padding-bottom: 10px;">AVALIAÇÕES DA PARTIDA</h2>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px;">
                <div>
                   <h3 style="color: var(--fifa-cyan); text-align: center; margin-bottom: 1rem;">${home.name}</h3>
                   ${renderGroup(home, 'var(--fifa-cyan)')}
                </div>
                <div>
                   <h3 style="color: var(--fifa-pink); text-align: center; margin-bottom: 1rem;">${away.name}</h3>
                   ${renderGroup(away, 'var(--fifa-pink)')}
                </div>
            </div>
        `;
    }

    isQueued(playerId) {
        return this.queuedSubs.some(s => s.in.id === playerId || s.out.id === playerId);
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

    isQueued(playerId) {
        if (!this.queuedSubs) return false;
        return this.queuedSubs.some(s => s.in.id === playerId || s.out.id === playerId);
    }

    renderSimNotes() {
        const center = document.querySelector('.sim-pitch-area');
        let panel = document.getElementById('sim-notes-panel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'sim-notes-panel';
            panel.style.padding = '20px';
            panel.style.overflowY = 'auto';
            panel.style.height = '100%';
            panel.style.background = 'rgba(0,0,0,0.4)';
            center.appendChild(panel);
        }
        panel.style.display = 'block';
        
        const home = this.currentSimHome;
        const away = this.currentSimAway;
        if (!home || !away) return;
        
        const renderGroup = (team, color) => {
            return team.roster.filter(p => p.status === 'Titular').map(p => `
                <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <span style="font-size: 0.85rem;"><strong>${p.pos}</strong> ${p.name}</span>
                    <span class="rating" style="background: ${color}; font-size: 0.8rem;">${p.strength}</span>
                </div>
            `).join('');
        };

        panel.innerHTML = `
            <h2 style="text-align: center; margin-bottom: 2rem; color: var(--gold); border-bottom: 1px solid var(--border); padding-bottom: 10px;">AVALIAÇÕES DA PARTIDA</h2>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px;">
                <div>
                   <h3 style="color: var(--fifa-cyan); text-align: center; margin-bottom: 1rem;">${home.name}</h3>
                   ${renderGroup(home, 'var(--fifa-cyan)')}
                </div>
                <div>
                   <h3 style="color: var(--fifa-pink); text-align: center; margin-bottom: 1rem;">${away.name}</h3>
                   ${renderGroup(away, 'var(--fifa-pink)')}
                </div>
            </div>
        `;
    }
}

window.simulator = new BrasileiraoSimulator();
export default window.simulator;
