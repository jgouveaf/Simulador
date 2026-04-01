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
            'B': this.initLeague('B'),
            'C': this.initLeague('C'),
            'D': this.initLeague('D'),
            'Copa': this.initCopa()
        };
        
        this.career = {
            active: false,
            team: null,
            budget: 50000000,
            manager: 'João Gouvêa'
        };

        this.activeSimInterval = null;
        this.activeSimTimeout = null;
        this.isSimulating = false;
        this.halftimeReached = false;

        this.init();
    }

    initLeague(serie) {
        let teams = this.allTeamsRaw
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

        let rounds = [];
        if (serie === 'A' || serie === 'B') {
            rounds = this.generateRounds(teams);
        } else if (serie === 'C') {
            rounds = this.generateRounds(teams, true); // Single round
        } else if (serie === 'D') {
            return this.initSerieD(teams);
        }
        
        return {
            serie,
            teams,
            rounds,
            currentRound: 0,
            status: 'Fase Inicial',
            phase: 1
        };
    }

    getAllTeams() {
        return [
            ...this.leagues['A'].teams,
            ...this.leagues['B'].teams,
            ...this.leagues['C'].teams,
            ...this.leagues['D'].teams
        ];
    }

    initSerieD(allTeams) {
        const groups = {};
        allTeams.forEach(t => {
            if (!groups[t.group]) groups[t.group] = [];
            groups[t.group].push(t);
        });

        const groupRounds = {};
        for (const gId in groups) {
            groupRounds[gId] = this.generateRounds(groups[gId]); // Double round-robin
        }

        return {
            serie: 'D',
            teams: allTeams,
            groups,
            groupRounds,
            currentRound: 0,
            status: 'Fase de Grupos',
            phase: 1,
            rounds: groupRounds['A1'] // Reference for total rounds
        };
    }

    initCopa() {
        // Top 64 teams for Copa
        const teams = this.allTeamsRaw
            .sort((a,b) => b.strength - a.strength)
            .slice(0, 64)
            .map(t => ({...t, strength: this.calculateTeamOverall(t)}));
        
        return {
            teams,
            rounds: this.generateKnockoutRounds(teams, "Copa do Brasil"),
            currentRound: 0,
            status: 'Iniciada',
            phase: 'Knockout'
        };
    }

    generateKnockoutRounds(teams, name) {
        // Initial draw
        let currentTeams = [...teams];
        this.shuffleArray(currentTeams);
        
        let rounds = [];
        let roundNames = ["Trinta-e-dois avos", "Dezesseis-avos", "Oitavas de Final", "Quartas de Final", "Semifinal", "Final"];
        
        let teamsCount = currentTeams.length;
        let roundIndex = 0;
        
        while (teamsCount >= 2) {
            let roundMatches = [];
            for (let i = 0; i < teamsCount; i += 2) {
                roundMatches.push({ 
                    home: currentTeams[i].id, 
                    away: currentTeams[i+1].id, 
                    homeScore: null, 
                    awayScore: null,
                    leg: 1
                });
            }
            
            rounds.push({ name: roundNames[roundIndex] || `Rodada ${roundIndex+1}`, matches: roundMatches, type: 'knockout', leg: 1 });
            
            // Second leg
            let secondLegMatches = roundMatches.map(m => ({
                home: m.away,
                away: m.home,
                homeScore: null,
                awayScore: null,
                leg: 2,
                firstLeg: m
            }));
            rounds.push({ name: (roundNames[roundIndex] || `Rodada ${roundIndex+1}`) + " (Volta)", matches: secondLegMatches, type: 'knockout', leg: 2 });

            teamsCount /= 2;
            roundIndex++;
            // Mock empty teams for next rounds
            currentTeams = Array(teamsCount).fill({id: null});
        }
        
        return rounds;
    }

    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[array[j]]] = [array[j], array[i]];
        }
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
        if (tabId === 'copa') this.renderCopaBracket();
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

    generateRounds(teams, singleRound = false) {
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

        if (singleRound) {
            return schedule.map((round, index) => ({
                matches: round,
                date: this.generateRoundDate(index)
            }));
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
        if (!lg) return;

        if (this.currentSerie === 'Copa') {
            this.simulateCopaRound();
            return;
        }

        if (this.currentSerie === 'D' && lg.phase === 1) {
            this.simulateSerieDGroups();
            return;
        }

        // Multi-League Unified Simulation
        ['A', 'B', 'C', 'D'].forEach(serie => {
            const currentLg = this.leagues[serie];
            if (!currentLg || currentLg.currentRound >= (currentLg.rounds?.length || 38)) return;

            // Handle standard leagues (A, B, C)
            if (serie !== 'D' || currentLg.phase !== 1) {
                const matches = currentLg.rounds[currentLg.currentRound].matches;
                matches.forEach(m => {
                    const isUserMatch = this.career.active && this.career.team && (m.home === this.career.team.id || m.away === this.career.team.id);
                    if (isUserMatch) {
                        userMatch = m;
                        userMatchLeague = currentLg;
                    } else if (!m.simulated) {
                        this.simulateMatch(m, currentLg.teams);
                    }
                });
            } else {
                // Serie D Phase 1 (Groups)
                for (const gId in currentLg.groups) {
                    const matches = currentLg.groupRounds[gId][currentLg.currentRound].matches;
                    matches.forEach(m => {
                        const isUserMatch = this.career.active && this.career.team && (m.home === this.career.team.id || m.away === this.career.team.id);
                        if (isUserMatch) {
                            userMatch = m;
                            userMatchLeague = currentLg;
                        } else if (!m.simulated) {
                            this.simulateMatch(m, currentLg.groups[gId]);
                        }
                    });
                }
            }
        });

        if (userMatch && !userMatch.simulated) {
            const card = document.getElementById('btn-career-simulate');
            if (card) { card.style.pointerEvents = 'none'; card.style.opacity = '0.5'; }
            
            const home = this.allTeamsRaw.find(t => t.id === userMatch.home);
            const away = this.allTeamsRaw.find(t => t.id === userMatch.away);
            
            this.startVisualSimulation(userMatch, home, away, () => {
                if (card) { card.style.pointerEvents = 'auto'; card.style.opacity = '1'; }
                
                // Finalize turn for all leagues
                ['A', 'B', 'C', 'D'].forEach(s => {
                    const l = this.leagues[s];
                    if (l && l.currentRound < (l.rounds?.length || 38)) {
                        l.currentRound++;
                        this.afterRoundSimulated(l, false);
                    }
                });
                
                this.handleMarketIA(); // Dynamic transfers after each round
                this.openScreen('career-hub');
            });
        } else {
            // Background turn for all leagues
            ['A', 'B', 'C', 'D'].forEach(s => {
                const l = this.leagues[s];
                if (l && l.currentRound < (l.rounds?.length || 38)) {
                    l.currentRound++;
                    this.afterRoundSimulated(l, false);
                }
            });
            this.handleMarketIA();
            this.openScreen('career-hub');
        }
    }

    afterRoundSimulated(lg, shouldNavigate = true) {
        lg.viewedRound = lg.currentRound < (lg.rounds?.length || 38) ? lg.currentRound : (lg.rounds?.length || 38) - 1;
        this.updateTable();
        this.displayRound();
        this.updateStats();
        this.displayCalendar();
        if (this.career.active) {
            this.updateCareerDashboard();
            if (shouldNavigate) this.openScreen('career-hub');
        }
        this.isSimulating = false;
        
        if (lg.currentRound >= (lg.rounds?.length || 38)) {
            this.checkPhaseAdvance(lg);
        }
    }

    simulateSerieDGroups() {
        const lg = this.leagues['D'];
        for (const gId in lg.groups) {
            const matches = lg.groupRounds[gId][lg.currentRound].matches;
            matches.forEach(m => this.simulateMatch(m, lg.groups[gId]));
        }
        lg.currentRound++;
        this.afterRoundSimulated(lg);
    }

    simulateCopaRound() {
        const lg = this.leagues['Copa'];
        const round = lg.rounds[lg.currentRound];
        round.matches.forEach(m => this.simulateKnockoutMatch(m, lg));
        lg.currentRound++;
        
        if (lg.currentRound < lg.rounds.length && lg.rounds[lg.currentRound].leg === 2) {
            // Immediately simulate second leg? No, let's keep it round by round.
        }

        if (lg.currentRound % 2 === 0) {
            this.advanceKnockoutPhase(lg);
        }
        
        this.afterRoundSimulated(lg);
    }

    simulateKnockoutMatch(match, lg) {
        if (match.homeScore !== null) return;
        
        const homeTeam = this.allTeamsRaw.find(t => t.id === match.home);
        const awayTeam = this.allTeamsRaw.find(t => t.id === match.away);
        
        const stats = this.getTeamStats(homeTeam);
        const awayStats = this.getTeamStats(awayTeam);
        
        // Simple fast sim for knockout
        const hAdv = match.leg === 1 ? 1.1 : 1.0;
        const hMean = (stats.atk * hAdv) / awayStats.def * 1.2;
        const aMean = (awayStats.atk) / stats.def * 1.1;
        
        match.homeScore = this.poissonRandom(hMean);
        match.awayScore = this.poissonRandom(aMean);
        
        if (match.leg === 2) {
            const first = match.firstLeg;
            const aggHome = match.awayScore + first.homeScore;
            const aggAway = match.homeScore + first.awayScore;
            
            if (aggHome === aggAway) {
                // Penalties nudge
                if (Math.random() > 0.5) match.homeScore++; 
                else match.awayScore++;
            }
        }
    }

    checkPhaseAdvance(lg) {
        if (lg.serie === 'C' && lg.phase === 1) {
            this.advanceSerieCPhase2(lg);
        } else if (lg.serie === 'D' && lg.phase === 1) {
            this.advanceSerieDPhase2(lg);
        }
    }

    advanceSerieCPhase2(lg) {
        const sorted = [...lg.teams].sort((a,b) => b.points - a.points);
        const top8 = sorted.slice(0, 8);
        
        lg.phase = 2;
        lg.status = 'Segunda Fase (Grupos)';
        
        const group1 = [top8[0], top8[3], top8[4], top8[7]];
        const group2 = [top8[1], top8[2], top8[5], top8[6]];
        
        lg.groups = { 'G1': group1, 'G2': group2 };
        lg.groupRounds = {
            'G1': this.generateRounds(group1),
            'G2': this.generateRounds(group2)
        };
        lg.rounds = lg.groupRounds['G1'];
        lg.currentRound = 0;
        alert("Série C: Fase 1 encerrada! Grupos da Fase 2 definidos.");
    }

    advanceSerieDPhase2(lg) {
        lg.phase = 2;
        lg.status = 'Mata-mata';
        
        const qualifiers = [];
        for (const gId in lg.groups) {
            const sorted = [...lg.groups[gId]].sort((a,b) => b.points - a.points);
            qualifiers.push(...sorted.slice(0, 4));
        }
        
        lg.rounds = this.generateKnockoutRounds(qualifiers, "Série D Knockout");
        lg.currentRound = 0;
        alert("Série D: Fase de Grupos encerrada! Início do Mata-mata.");
    }

    advanceKnockoutPhase(lg) {
        const round = lg.rounds[lg.currentRound - 1]; // Round just finished (leg 2)
        const winners = [];
        
        round.matches.forEach(m => {
            const first = m.firstLeg;
            const aggHome = m.awayScore + first.homeScore;
            const aggAway = m.homeScore + first.awayScore;
            if (aggHome >= aggAway) winners.push(this.allTeamsRaw.find(t => t.id === m.away));
            else winners.push(this.allTeamsRaw.find(t => t.id === m.home));
        });
        
        if (winners.length < 2) {
            lg.status = "Encerrada";
            return;
        }

        // Draw next round
        const nextRoundMatches = [];
        for (let i = 0; i < winners.length; i += 2) {
            nextRoundMatches.push({ home: winners[i].id, away: winners[i+1].id, homeScore: null, awayScore: null, leg: 1 });
        }
        
        const nextRoundIndex = lg.rounds.length;
        lg.rounds.push({ name: `Fase Seguinte (Ida)`, matches: nextRoundMatches, type: 'knockout', leg: 1 });
        
        const secondLegMatches = nextRoundMatches.map(m => ({
            home: m.away,
            away: m.home,
            homeScore: null,
            awayScore: null,
            leg: 2,
            firstLeg: m
        }));
        lg.rounds.push({ name: `Fase Seguinte (Volta)`, matches: secondLegMatches, type: 'knockout', leg: 2 });
    }

    startVisualSimulation(match, home, away, callback) {
        console.log("Opening visual simulation screen...");
        
        // Safety Clear
        if (this.activeSimInterval) clearInterval(this.activeSimInterval);
        if (this.activeSimTimeout) clearTimeout(this.activeSimTimeout);
        
        this.openScreen('match-simulation');
        console.log("Screen active. Setting up UI...");
        
        let simFinished = false;
        const finishMatch = (isSkipped = false) => {
            if (simFinished) return;
            simFinished = true;
            
            if (this.activeSimInterval) clearInterval(this.activeSimInterval);
            if (this.activeSimTimeout) clearTimeout(this.activeSimTimeout);
            
            if (isSkipped) {
                match.homeScore = tempMatch.homeScore;
                match.awayScore = tempMatch.awayScore;
            } else {
                match.homeScore = homeScore;
                match.awayScore = awayScore;
            }
            
            match.simulated = true;
            
            // IMPORTANT: Update league tables if not a friendly
            if (!match.isFriendly) {
                const lg = this.leagues[this.currentSerie];
                if (lg) this.updateLeagueStandings(match, lg.teams);
            }
            
            callback();
        };

        // Setup UI
        document.getElementById('sim-home-name').textContent = home.name.toUpperCase();
        document.getElementById('sim-away-name').textContent = away.name.toUpperCase();
        
        const homeLogoEl = document.getElementById('sim-home-logo');
        const awayLogoEl = document.getElementById('sim-away-logo');
        
        if (home.logo) {
            homeLogoEl.style.backgroundImage = `url(${home.logo})`;
            homeLogoEl.style.backgroundSize = 'contain';
            homeLogoEl.style.backgroundRepeat = 'no-repeat';
            homeLogoEl.style.backgroundPosition = 'center';
            homeLogoEl.style.backgroundColor = 'transparent';
        } else {
            homeLogoEl.style.backgroundColor = home.color;
            homeLogoEl.style.backgroundImage = 'none';
        }

        if (away.logo) {
            awayLogoEl.style.backgroundImage = `url(${away.logo})`;
            awayLogoEl.style.backgroundSize = 'contain';
            awayLogoEl.style.backgroundRepeat = 'no-repeat';
            awayLogoEl.style.backgroundPosition = 'center';
            awayLogoEl.style.backgroundColor = 'transparent';
        } else {
            awayLogoEl.style.backgroundColor = away.color;
            awayLogoEl.style.backgroundImage = 'none';
        }
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
        const tempMatch = { ...match, homeScore: null, awayScore: null };
        this.simulateMatch(tempMatch, [home, away]);
        
        // Distribution of goals over time
        const goalEvents = [];
        for(let i=0; i<tempMatch.homeScore; i++) goalEvents.push({ team: 'home', min: Math.floor(Math.random() * 90) + 1 });
        for(let i=0; i<tempMatch.awayScore; i++) goalEvents.push({ team: 'away', min: Math.floor(Math.random() * 90) + 1 });
        
        let simMinute = 0;
        let homeScore = 0;
        let awayScore = 0;
        
        const ball = document.getElementById('sim-pitch-ball');
        
        // --- COMMENTARY LOGIC ---
        const logEvent = (text) => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.gap = '10px';
            row.style.padding = '8px';
            row.style.borderLeft = '4px solid var(--fifa-cyan)';
            row.style.background = 'rgba(0,0,0,0.2)';
            row.style.marginBottom = '5px';
            row.style.fontSize = '0.8rem';
            row.style.animation = 'fadeIn 0.3s ease';
            
            row.innerHTML = `
                <div style="font-weight: 800; color: var(--fifa-cyan); min-width: 25px;">${simMinute}'</div>
                <div style="flex: 1;">${text}</div>
            `;
            awayList.prepend(row);
        };

        logEvent(`APITA O ÁRBITRO! COMEÇA A PARTIDA ENTRE ${home.name.toUpperCase()} E ${away.name.toUpperCase()}!`);

        const runSimLoop = () => {
            this.activeSimInterval = setInterval(() => {
                if (simMinute === 45 && !this.halftimeReached) {
                    this.halftimeReached = true;
                    clearInterval(this.activeSimInterval);
                    logEvent("INTERVALO! OS TIMES VÃO PARA O VESTIÁRIO.");
                    this.activeSimTimeout = setTimeout(() => {
                        logEvent("RECOMEÇA O JOGO! BOLA ROLANDO PARA A ETAPA FINAL.");
                        runSimLoop();
                    }, 2000);
                    return;
                }

                simMinute++;
                document.getElementById('sim-time-value').textContent = `${simMinute.toString().padStart(2, '0')}:00`;
                
                // Commentary chances
                if (Math.random() < 0.05) {
                    const comments = [
                        `${home.name} tenta avançar pela lateral.`,
                        `${away.name} troca passes no meio campo.`,
                        `Jogo fica truncado no círculo central.`,
                        `Torcida do ${home.name} canta alto no estádio!`,
                        `A posse de bola está equilibrada.`,
                        `${away.name} se fecha bem na defesa.`,
                        `Pressão total do ${home.name} agora!`
                    ];
                    logEvent(comments[Math.floor(Math.random() * comments.length)]);
                }

                // Random dot movement
                document.querySelectorAll('.player-dot').forEach(dot => {
                    let newLeft = parseFloat(dot.style.left) + (Math.random() - 0.5) * 5;
                    let newTop = parseFloat(dot.style.top) + (Math.random() - 0.5) * 5;
                    
                    if (newLeft < 5) newLeft = 5; if (newLeft > 95) newLeft = 95;
                    if (newTop < 5) newTop = 5; if (newTop > 95) newTop = 95;
                    
                    dot.style.left = `${newLeft}%`;
                    dot.style.top = `${newTop}%`;
                });
                
                // Ball movement
                const dots = document.querySelectorAll('.player-dot');
                const targetDot = dots[Math.floor(Math.random() * dots.length)];
                ball.style.left = targetDot.style.left;
                ball.style.top = targetDot.style.top;
                
                // Check for goals
                const goalsNow = goalEvents.filter(g => g.min === simMinute);
                goalsNow.forEach(g => {
                    const scoringTeam = g.team === 'home' ? home : away;
                    if (g.team === 'home') homeScore++;
                    else awayScore++;
                    
                    logEvent(`GOOOOOOOOOOL DO ${scoringTeam.name.toUpperCase()}!!! GOL DE PLACA!`);
                    
                    document.getElementById('sim-score-value').textContent = `${homeScore} - ${awayScore}`;
                    const pitchEl = document.querySelector('.soccer-pitch');
                    if (pitchEl) {
                        pitchEl.classList.add('goal-flash');
                        setTimeout(() => pitchEl.classList.remove('goal-flash'), 1000);
                    }
                    ball.style.left = '50%';
                    ball.style.top = '50%';
                });
                
                if (simMinute >= 90) {
                    clearInterval(this.activeSimInterval);
                    logEvent("FIM DE JOGO! APITA O ÁRBITRO O TÉRMINO DA PARTIDA.");
                    this.activeSimTimeout = setTimeout(() => {
                        finishMatch();
                    }, 2500);
                }
            }, 100); // 100ms for faster, more dynamic feel
        };

        runSimLoop();

        // Skip button
        document.getElementById('btn-sim-skip').onclick = () => {
            finishMatch(true);
        };

        // Mentality Logic
        document.querySelectorAll('.btn-mentality').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.btn-mentality').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                match.currentMentality = btn.dataset.mentality;
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
                    <button class="${this.selectionSerie === 'C' ? 'active' : ''}" onclick="simulator.changeSelectionSerie('C')">SÉRIE C</button>
                    <button class="${this.selectionSerie === 'D' ? 'active' : ''}" onclick="simulator.changeSelectionSerie('D')">SÉRIE D</button>
                </div>
                
                <div class="picker-main">
                    <button class="nav-arrow" onclick="simulator.navigateTeamSelection(-1)">❮</button>
                    
                    <div class="team-showcase">
                        <div class="team-logo-big" style="background: linear-gradient(135deg, ${team.color}44 0%, transparent 100%);">
                            <img src="${team.logo || 'logo.png'}" alt="${team.name}" onerror="this.src='logo.png'">
                        </div>
                        <h2 class="team-name-selection">
                            ${team.name.toUpperCase()} 
                            <span class="ovr-chip high" style="vertical-align: middle; margin-left: 10px;">${team.strength}</span>
                        </h2>
                        <div class="stars-container" style="margin-bottom: 2rem;">${starHTML}</div>
                        
                        <div class="team-stats-selection">
                            <div class="stat-box">
                                <small>ATA</small>
                                <strong>${stats.att}</strong>
                            </div>
                            <div class="stat-box">
                                <small>MEI</small>
                                <strong>${stats.mid}</strong>
                            </div>
                            <div class="stat-box">
                                <small>DEF</small>
                                <strong>${stats.def}</strong>
                            </div>
                        </div>
                        <p style="font-size: 0.9rem; color: var(--gold); margin-top: 1rem;">Orçamento: R$ ${(this.getInitialBudget(team)/1000000).toFixed(0)}M</p>
                    </div>
                    
                    <button class="nav-arrow" onclick="simulator.navigateTeamSelection(1)">❯</button>
                </div>
                
                <button class="btn-fifa-select" onclick="simulator.selectTeam('${team.id}')">ESCOLHER TIME</button>
            </div>
        `;
    }

    startTeamSelection() {
        this.selectionSerie = 'A';
        this.selectionIndex = 0;
        this.openScreen('team-selection');
        this.renderTeamSelection();
    }

    changeSelectionSerie(s) {
        this.selectionSerie = s;
        // Reset selection index to first team in new league
        this.selectionIndex = 0;
        this.renderTeamSelection();
    }

    navigateTeamSelection(dir) {
        const teams = this.allTeamsRaw.filter(t => t.serie === this.selectionSerie);
        this.selectionIndex = (this.selectionIndex + dir + teams.length) % teams.length;
        this.renderTeamSelection();
    }

    getStarRatingHTML(team) {
        // Calculate average of 11 starters
        const starters = team.roster.filter(p => p.status === 'Titular');
        const avg = starters.length > 0 
            ? starters.reduce((acc, p) => acc + p.strength, 0) / starters.length 
            : (team.strength || 70);

        let stars = 1;
        if (avg >= 83) stars = 5;
        else if (avg >= 81) stars = 4.5;
        else if (avg >= 79) stars = 4;
        else if (avg >= 76) stars = 3.5;
        else if (avg >= 73) stars = 3;
        else if (avg >= 68) stars = 2.5;
        else if (avg >= 63) stars = 2;
        else if (avg >= 55) stars = 1.5;
        else stars = 1;

        let html = '';
        for (let i = 1; i <= 5; i++) {
            if (i <= Math.floor(stars)) html += '<i class="fas fa-star" style="color:var(--gold);"></i>';
            else if (i === Math.ceil(stars) && stars % 1 !== 0) html += '<i class="fas fa-star-half-alt" style="color:var(--gold);"></i>';
            else html += '<i class="far fa-star" style="color:gray;"></i>';
        }
        return html;
    }

    calculateDetailedStats(team) {
        const calculateAvg = (positions) => {
            const list = team.roster.filter(p => (p.status === 'Titular' || p.status === 'Reserva') && positions.includes(p.pos));
            if (list.length === 0) return team.strength || 70;
            return Math.round(list.reduce((acc, p) => acc + p.strength, 0) / list.length);
        };

        return {
            att: calculateAvg(['ATA', 'CA', 'PE', 'PD']),
            mid: calculateAvg(['VOL', 'MEI', 'MC']),
            def: calculateAvg(['ZAG', 'LE', 'LD', 'GOL'])
        };
    }

    getInitialBudget(team) {
        if (team.serie === 'A') {
            if (team.strength >= 84) return 300000000;
            else if (team.strength >= 78) return 100000000;
            else return 50000000;
        } else if (team.serie === 'B') {
            return 15000000;
        } else if (team.serie === 'C') {
            return 5000000;
        } else {
            return 2000000;
        }
    }

    selectTeam(teamId) {
        const team = this.allTeamsRaw.find(t => t.id === teamId);
        this.currentSerie = team.serie;
        this.career.active = true;
        this.career.team = this.leagues[this.currentSerie].teams.find(t => t.id === teamId);
        
        this.career.budget = this.getInitialBudget(team);
        document.getElementById('user-team-name').textContent = team.name;
        const logoEl = document.getElementById('user-team-logo');
        if (team.logo) {
            logoEl.style.backgroundImage = `url(${team.logo})`;
            logoEl.style.backgroundSize = 'contain';
            logoEl.style.backgroundRepeat = 'no-repeat';
            logoEl.style.backgroundPosition = 'center';
            logoEl.style.backgroundColor = 'transparent';
        } else {
            logoEl.style.backgroundColor = team.color;
            logoEl.style.backgroundImage = 'none';
        }
        
        this.openScreen('career-hub');
        this.switchTab('central');
    }

    updateCareerDashboard() {
        const lg = this.leagues[this.currentSerie];
        const nextRound = lg.rounds[lg.currentRound];
        const team = this.career.team;
        
        // Update Header with more info
        const starsEl = document.getElementById('user-team-stars');
        if (starsEl) {
            starsEl.innerHTML = this.getStarRatingHTML(team);
        }
        
        const nameEl = document.getElementById('user-team-name');
        if (nameEl) {
            nameEl.innerHTML = `
                <div style="display: flex; align-items: center; gap: 12px;">
                    ${team.name}
                    <div class="ovr-chip high" style="font-size: 0.8rem; padding: 2px 6px;">${team.strength}</div>
                </div>
            `;
        }

        if (nextRound) {
            const userMatch = nextRound.matches.find(m => m.home === this.career.team.id || m.away === this.career.team.id);
            const opponentId = userMatch.home === this.career.team.id ? userMatch.away : userMatch.home;
            const opponent = lg.teams.find(t => t.id === opponentId);
            
            const card = document.getElementById('btn-career-simulate');
            if (card) {
                card.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2rem;">
                        <div>
                            <p style="color: var(--fifa-cyan); font-weight: 800; font-size: 0.7rem; margin-bottom: 5px;">PRÓXIMO JOGO</p>
                            <h3 style="font-size: 2rem; font-weight: 900; margin: 0;">vs ${opponent.name}</h3>
                            <p style="color: var(--text-secondary); font-size: 0.8rem;">Rodada ${lg.currentRound + 1} • ${nextRound.date.toLocaleDateString('pt-BR')}</p>
                        </div>
                        <div style="width: 80px; height: 80px; background: rgba(255,255,255,0.03); border-radius: 50%; display: flex; align-items: center; justify-content: center; padding: 10px;">
                            <img src="${opponent.logo || 'logo.png'}" style="width: 100%; height: 100%; object-fit: contain;" onerror="this.src='logo.png'">
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <button class="btn-fifa-select" style="margin: 0; padding: 12px 30px; font-size: 1rem;">Jogar Partida</button>
                    </div>
                `;
            }
        } else {
            const card = document.getElementById('btn-career-simulate');
            if (card) card.innerHTML = `<h3>Fim da Temporada</h3><p>Não há mais jogos agendados.</p>`;
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
        if (!t) return;

        const titContainer = document.getElementById('career-titulares');
        const resContainer = document.getElementById('career-reservas');
        const notContainer = document.getElementById('career-not-related');
        
        titContainer.innerHTML = '';
        resContainer.innerHTML = '';
        notContainer.innerHTML = '';
        
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
        const groupsContainer = document.getElementById('league-groups-container');
        const mainTableCard = document.getElementById('main-table-card');
        if (!table) return;

        // Series Filter Logic
        document.querySelectorAll('.btn-serie-filter').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.btn-serie-filter').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const serie = btn.dataset.serie;
                this.currentViewingSerie = serie;
                this.renderCareerStandings();
            };
        });

        const serie = this.currentViewingSerie || this.currentSerie;
        const lg = this.leagues[serie];

        if (serie === 'D' && lg.phase === 1) {
            mainTableCard.style.display = 'none';
            groupsContainer.style.display = 'block';
            this.renderGroups(lg, groupsContainer);
            return;
        } else if (serie === 'C' && lg.phase === 2) {
            mainTableCard.style.display = 'none';
            groupsContainer.style.display = 'block';
            this.renderGroups(lg, groupsContainer);
            return;
        } else {
            mainTableCard.style.display = 'block';
            groupsContainer.style.display = 'none';
        }

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
                </tr>
            </thead>
            <tbody></tbody>
        `;

        const tbody = table.querySelector('tbody');
        sortedTeams.forEach((team, index) => {
            const tr = document.createElement('tr');
            if (this.career.team && team.id === this.career.team.id) tr.style.background = 'rgba(0, 242, 255, 0.1)';
            
            const logo = team.logo ? `<img src="${team.logo}" class="team-logo-small">` : `<div class="team-color" style="background-color: ${team.color};"></div>`;

            tr.innerHTML = `
                <td class="pos">${index + 1}</td>
                <td>
                    <div class="team-name team-clickable" data-id="${team.id}">
                        ${logo}
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
            `;
            tbody.appendChild(tr);
        });

        tbody.querySelectorAll('.team-clickable').forEach(el => {
            el.onclick = () => this.showTeamDetails(parseInt(el.dataset.id));
        });
    }

    renderGroups(lg, container) {
        container.innerHTML = `<div class="group-grid"></div>`;
        const grid = container.querySelector('.group-grid');

        for (const gId in lg.groups) {
            const groupTeams = lg.groups[gId];
            const sorted = [...groupTeams].sort((a,b) => b.points - a.points || b.goalDiff - a.goalDiff);
            
            const card = document.createElement('div');
            card.className = 'group-card';
            card.innerHTML = `
                <div class="group-title">GRUPO ${gId}</div>
                <table class="compact-table" style="width: 100%; font-size: 0.75rem;">
                    <thead><tr><th>#</th><th>Time</th><th>P</th><th>V</th><th>SG</th></tr></thead>
                    <tbody>
                        ${sorted.map((t, idx) => `
                            <tr style="${this.career.team && t.id === this.career.team.id ? 'color: var(--fifa-cyan)' : ''}">
                                <td>${idx+1}</td>
                                <td>${t.name}</td>
                                <td>${t.points}</td>
                                <td>${t.won}</td>
                                <td>${t.goalDiff}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
            grid.appendChild(card);
        }
    }

    renderCopaBracket() {
        const lg = this.leagues['Copa'];
        const container = document.getElementById('copa-bracket-container');
        if (!container) return;
        
        container.innerHTML = '';
        
        // Show only the current knockout stage or all rounds?
        // Let's show structured by round
        const rounds = lg.rounds.filter(r => r.leg === 1);
        
        rounds.forEach(r => {
            const col = document.createElement('div');
            col.className = 'bracket-round';
            col.innerHTML = `<div style="font-weight: 800; font-size: 0.7rem; color: var(--gold); text-align: center; margin-bottom: 1rem;">${r.name.toUpperCase()}</div>`;
            
            r.matches.forEach(m => {
                const home = this.allTeamsRaw.find(t => t.id === m.home);
                const away = this.allTeamsRaw.find(t => t.id === m.away);
                const matchDiv = document.createElement('div');
                matchDiv.className = 'bracket-match';
                
                const secondLeg = lg.rounds.find(round => round.leg === 2 && round.matches.find(sm => sm.firstLeg === m));
                const sMatch = secondLeg ? secondLeg.matches.find(sm => sm.firstLeg === m) : null;
                
                const agg1 = (m.homeScore || 0) + (sMatch ? sMatch.awayScore || 0 : 0);
                const agg2 = (m.awayScore || 0) + (sMatch ? sMatch.homeScore || 0 : 0);

                matchDiv.innerHTML = `
                    <div class="bracket-team ${agg1 > agg2 ? 'winner' : ''}">${home.name} <span>${agg1}</span></div>
                    <div class="bracket-team ${agg2 > agg1 ? 'winner' : ''}">${away.name} <span>${agg2}</span></div>
                `;
                col.appendChild(matchDiv);
            });
            container.appendChild(col);
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

        if (this.isSimulating) return;
        this.isSimulating = true;
        
        const btn = document.getElementById('btn-play-friendly');
        if (btn) btn.disabled = true;

        const match = { home: hId, away: aId, homeScore: null, awayScore: null, isFriendly: true };
        
        this.startVisualSimulation(match, homeTeam, awayTeam, () => {
            this.isSimulating = false;
            if (btn) btn.disabled = false;
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
        if (titulares.length === 11) {
            const sum = titulares.reduce((acc, p) => acc + p.strength, 0);
            return Math.round(sum / 11);
        }
        const sum = team.roster.reduce((acc, p) => acc + p.strength, 0);
        return Math.round(sum / team.roster.length);
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

    // --- MERCADO & CALENDÁRIO ---
    assignRandomImportance() {
        const options = [1.5, 1.2, 1.0, 0.8];
        return options[Math.floor(Math.random() * options.length)];
    }

    calculatePlayerValue(p) {
        // FIFA Formula: V = (1.15^O * 10.000) * I
        const base = Math.pow(1.15, p.strength) * 10000;
        return Math.floor((base * (p.importance || 1.0)) / 10);
    }

    generateSeasonCalendar() {
        // Base 365 dias
        const calendar = [];
        for (let i = 1; i <= 365; i++) {
            calendar.push({ day: i, match: null });
        }
        return calendar;
    }

    advanceDay() {
        this.career.currentDay++;
        if (this.career.currentDay > 365) this.career.currentDay = 1;

        // Janelas: 1-30 e 180-210
        const d = this.career.currentDay;
        this.career.isWindowOpen = (d >= 1 && d <= 30) || (d >= 180 && d <= 210);

        // A cada 3 dias na janela, IA negocia
        if (this.career.isWindowOpen && d % 3 === 0) {
            this.handleMarketIA();
        }

        // Update UI
        const dayDisplay = document.getElementById('career-day-display');
        if (dayDisplay) dayDisplay.innerText = `Dia ${this.career.currentDay}`;

        this.updateTable();
        this.renderMarket();
        this.updateStats();
    }

    handleMarketIA() {
        const series = ['A', 'B', 'C', 'D'];
        const s = series[Math.floor(Math.random() * series.length)];
        const league = this.leagues[s];
        if (league.teams.length < 2) return;

        const buyer = league.teams[Math.floor(Math.random() * league.teams.length)];
        const seller = league.teams[Math.floor(Math.random() * league.teams.length)];
        if (buyer.id === seller.id || buyer.id === this.career.team?.id) return;

        const target = seller.roster[Math.floor(Math.random() * seller.roster.length)];
        if (!target) return;

        if (target.marketValue <= 50000000) { // Orçamento IA fixo p/ simulação
            const posCount = buyer.roster.filter(p => p.pos === target.pos).length;
            if (posCount < 2) {
                this.executeTransfer(target, seller, buyer);
            }
        }
    }

    executeTransfer(player, fromTeam, toTeam) {
        fromTeam.roster = fromTeam.roster.filter(p => p.id !== player.id);
        const newPlayer = { ...player, currentClub: toTeam.name, status: 'Não Relacionado' };
        toTeam.roster.push(newPlayer);
        
        this.normalizeTeamRoster(fromTeam);
        this.normalizeTeamRoster(toTeam);
        
        fromTeam.strength = this.calculateTeamOverall(fromTeam);
        toTeam.strength = this.calculateTeamOverall(toTeam);
    }

    handlePlayerOffer(playerId, offer) {
        if (!this.career.isWindowOpen) {
            alert('A janela de transferências está fechada!');
            return;
        }
        const player = this.findPlayerById(playerId);
        const owner = this.findTeamByPlayerId(playerId);
        if (!player || !owner) return;

        this.career.negotiations[playerId] = (this.career.negotiations[playerId] || 0) + 1;
        if (this.career.negotiations[playerId] > 3) {
            alert(`Negociação encerrada pelo ${owner.name}.`);
            return;
        }

        const minAccept = player.marketValue * (player.importance || 1.0);
        if (offer >= minAccept) {
            if (this.career.budget >= offer) {
                this.career.budget -= offer;
                this.executeTransfer(player, owner, this.career.team);
                alert('CONTRATAÇÃO REALIZADA!');
            } else alert('Sem verba!');
        } else if (offer >= player.marketValue * 0.8) {
            const counter = Math.floor(player.marketValue * 1.1);
            alert(`CONTRAPROPOSTA: O ${owner.name} quer ${this.formatMoney(counter)}.`);
        } else alert('PROPOSTA IRRISÓRIA! Recusada.');

        this.renderMarket();
        this.updateStats();
    }

    findPlayerById(id) {
        for (const s of ['A', 'B', 'C', 'D']) {
            if (!this.leagues[s]) continue;
            for (const t of this.leagues[s].teams) {
                const p = t.roster.find(px => px.id == id);
                if (p) return p;
            }
        }
        return null;
    }

    findTeamByPlayerId(id) {
        for (const s of ['A', 'B', 'C', 'D']) {
            if (!this.leagues[s]) continue;
            for (const t of this.leagues[s].teams) {
                if (t.roster.some(px => px.id == id)) return t;
            }
        }
        return null;
    }

    finishSeason() {
        const standings = {};
        for(const s of ['A', 'B', 'C', 'D']) {
            standings[s] = [...this.leagues[s].teams].sort((a, b) => {
                if (b.points !== a.points) return b.points - a.points;
                if (b.won !== a.won) return b.won - a.won;
                if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
                return b.goalsFor - a.goalsFor;
            });
        }

        const playerPos = standings[this.currentSerie].findIndex(t => t.id === this.career.team.id) + 1;
        let reward = 0;

        if (playerPos === 1) reward = 25000000;
        else if (playerPos <= 4) reward = 15000000;
        else if (playerPos <= 10) reward = 8000000;
        else reward = 3000000;

        this.career.budget += reward;
        const oldYear = this.career.year;
        this.career.year++;
        this.career.currentDay = 1;

        const relegatedFromA = standings['A'].slice(-4);
        const promotedToA = standings['B'].slice(0, 4);

        const relegatedFromB = standings['B'].slice(-4);
        const promotedToB = standings['C'].slice(0, 4);

        const relegatedFromC = standings['C'].slice(-4);
        const promotedToC = standings['D'].slice(0, 4);

        relegatedFromA.forEach(t => { this.allTeamsRaw.find(tx => tx.id === t.id).serie = 'B'; });
        promotedToA.forEach(t => { this.allTeamsRaw.find(tx => tx.id === t.id).serie = 'A'; });
        
        relegatedFromB.forEach(t => { this.allTeamsRaw.find(tx => tx.id === t.id).serie = 'C'; });
        promotedToB.forEach(t => { this.allTeamsRaw.find(tx => tx.id === t.id).serie = 'B'; });

        relegatedFromC.forEach(t => { this.allTeamsRaw.find(tx => tx.id === t.id).serie = 'D'; });
        promotedToC.forEach(t => { this.allTeamsRaw.find(tx => tx.id === t.id).serie = 'C'; });

        this.allTeamsRaw.forEach(t => {
            t.roster.forEach(p => {
                p.seasonGoals = 0; 
                p.currentRating = 6.0;
            });
        });

        const newTeamObj = this.allTeamsRaw.find(t => t.id === this.career.team.id);
        this.currentSerie = newTeamObj.serie;

        alert(`Fim da Temporada ${oldYear}!\nSua posição: ${playerPos}º\nPrêmio de desempenho: R$ ${reward.toLocaleString('pt-BR')}\nIniciando temporada ${this.career.year}...`);

        this.leagues = {
            'A': this.initLeague('A'),
            'B': this.initLeague('B'),
            'C': this.initLeague('C'),
            'D': this.initLeague('D')
        };
        
        this.career.team = this.leagues[this.currentSerie].teams.find(t => t.id === this.career.team.id);

        this.updateTable();
        this.displayRound();
        this.updateStats();
        this.displayCalendar();
        this.updateCareerDashboard();
        this.openScreen('career-hub');
    }

    renderMarket() {
        const container = document.getElementById('market-players-list');
        if (!container) return;

        const nameF = document.getElementById('market-search-name')?.value.toLowerCase() || '';
        const posF = document.getElementById('market-filter-pos')?.value || 'ALL';

        let all = [];
        for (const s of ['A', 'B', 'C', 'D']) {
            if (!this.leagues[s]) continue;
            this.leagues[s].teams.forEach(t => {
                if (t.id !== this.career.team?.id) {
                    t.roster.forEach(p => all.push({ ...p, teamName: t.name, teamId: t.id }));
                }
            });
        }

        const minP = parseInt(document.getElementById('market-filter-min')?.value) || 0;
        const maxP = parseInt(document.getElementById('market-filter-max')?.value) || 9999999999;

        const filtered = all.filter(p => {
            const mN = p.name.toLowerCase().includes(nameF);
            const mP = posF === 'ALL' || p.pos === posF;
            const mVal = p.marketValue >= minP && p.marketValue <= maxP;
            return mN && mP && mVal;
        }).slice(0, 40);

        container.innerHTML = `
            <div class="market-status-bar">
                Dia: ${this.career.currentDay}/365 | Janela: ${this.career.isWindowOpen ? '✅ ABERTA' : '🔒 FECHADA'}
                <button onclick="simulator.advanceDay()" class="badge" style="background:var(--fifa-cyan); border:none; margin-left:20px; cursor:pointer;">AVANÇAR DIA</button>
            </div>
            <table class="market-list-table">
                <thead>
                    <tr><th>NOME</th><th>POS</th><th>OVR</th><th>CLUBE</th><th>VALOR</th><th>AÇÃO</th></tr>
                </thead>
                <tbody>
                    ${filtered.map(p => `
                        <tr>
                            <td>${p.name}</td>
                            <td><span class="badge">${p.pos}</span></td>
                            <td><span class="ovr-chip">${p.strength}</span></td>
                            <td>${p.teamName}</td>
                            <td>${this.formatMoney(p.marketValue)}</td>
                            <td><button class="btn-buy" onclick="simulator.initiateNegotiation(${p.id})" ${!this.career.isWindowOpen ? 'disabled' : ''}>Contratar</button></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    initiateNegotiation(id) {
        const p = this.findPlayerById(id);
        if (!p) return;
        const offerStr = prompt(`Oferta por ${p.name}? (Valor estimado: ${this.formatMoney(p.marketValue)})`);
        if (offerStr) {
            const offer = parseInt(offerStr.replace(/\D/g, ''));
            if (!isNaN(offer)) this.handlePlayerOffer(id, offer);
        }
    }

    formatMoney(v) {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
    }
}

window.simulator = new BrasileiraoSimulator();
export default window.simulator;
