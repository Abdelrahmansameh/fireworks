import { ProgressionSimulator } from './ProgressionSimulator.js';

export function initializeProgressionTool() {
    if (document.getElementById('progression-tool-overlay')) {
        document.getElementById('progression-tool-overlay').style.display = 'flex';
        return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'progression-tool-overlay';
    Object.assign(overlay.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(10, 10, 15, 0.95)',
        zIndex: '999999',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'monospace',
        padding: '20px',
        boxSizing: 'border-box',
        overflowY: 'auto'
    });

    const header = document.createElement('div');
    Object.assign(header.style, { display: 'flex', justifyContent: 'space-between', marginBottom: '20px' });
    
    const title = document.createElement('h2');
    title.innerText = 'Progression & Balance Simulator';
    title.style.margin = '0';

    const closeBtn = document.createElement('button');
    closeBtn.innerText = 'Close';
    closeBtn.style.padding = '5px 10px';
    closeBtn.onclick = () => overlay.style.display = 'none';

    header.appendChild(title);
    header.appendChild(closeBtn);
    overlay.appendChild(header);

    const content = document.createElement('div');
    Object.assign(content.style, { display: 'flex', flex: '1', gap: '20px', minHeight: '0' });

    // LEFT PANEL: Controls
    const controlsPanel = document.createElement('div');
    Object.assign(controlsPanel.style, { flex: '0 0 300px', display: 'flex', flexDirection: 'column', gap: '15px' });

    const createInput = (id, label, defaultValue, type = 'number') => {
        const wrap = document.createElement('div');
        const lbl = document.createElement('label');
        lbl.innerText = label;
        lbl.style.display = 'block';
        lbl.style.marginBottom = '5px';
        lbl.style.fontSize = '12px';
        const inp = document.createElement('input');
        inp.id = id;
        inp.type = type;
        inp.value = defaultValue;
        inp.style.width = '100%';
        inp.style.padding = '5px';
        inp.style.background = '#222';
        inp.style.color = '#fff';
        inp.style.border = '1px solid #555';
        wrap.appendChild(lbl);
        wrap.appendChild(inp);
        controlsPanel.appendChild(wrap);
        return inp;
    };

    createInput('simDuration', 'Simulation Duration (Minutes)', 60);
    createInput('simClicks', 'Clicks per Second', 4);
    createInput('simBaseDrone', 'Base Drone Yield (Sparkles/sec prev-upgrades)', 10);
    createInput('simBaseCatch', 'Base Catch Yield (Sparkles/sec pre-upgrades)', 5);

    const runBtn = document.createElement('button');
    runBtn.innerText = 'Run Simulation';
    runBtn.style.padding = '10px';
    runBtn.style.background = '#4CAF50';
    runBtn.style.color = '#fff';
    runBtn.style.border = 'none';
    runBtn.style.cursor = 'pointer';
    runBtn.style.marginTop = '10px';
    controlsPanel.appendChild(runBtn);

    // Timeline Log
    const timelineContainer = document.createElement('div');
    Object.assign(timelineContainer.style, { flex: '1', background: '#111', border: '1px solid #333', overflowY: 'auto', padding: '10px', fontSize: '11px' });
    const timelineTitle = document.createElement('h3');
    timelineTitle.innerText = 'Purchase Timeline';
    timelineTitle.style.marginTop = '0';
    timelineContainer.appendChild(timelineTitle);
    
    const timelineData = document.createElement('div');
    timelineContainer.appendChild(timelineData);

    controlsPanel.appendChild(timelineContainer);

    content.appendChild(controlsPanel);

    // RIGHT PANEL: Charts
    const chartsPanel = document.createElement('div');
    Object.assign(chartsPanel.style, { flex: '1', display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto' });

    const createChartCanvas = (id) => {
        const wrap = document.createElement('div');
        Object.assign(wrap.style, { background: '#111', border: '1px solid #333', padding: '10px', minHeight: '300px' });
        const canvas = document.createElement('canvas');
        canvas.id = id;
        wrap.appendChild(canvas);
        chartsPanel.appendChild(wrap);
    };

    createChartCanvas('chart-sps');
    createChartCanvas('chart-gps');
    createChartCanvas('chart-upgrades');
    createChartCanvas('chart-crowd');
    content.appendChild(chartsPanel);

    overlay.appendChild(content);
    document.body.appendChild(overlay);

    // Logic
    let chartSpsInstance = null;
    let chartGpsInstance = null;
    let chartUpgradesInstance = null;
    let chartCrowdInstance = null;
    const simulator = new ProgressionSimulator();

    runBtn.onclick = () => {
        const duration = parseFloat(document.getElementById('simDuration').value) || 60;
        const inputs = {
            clicksPerSec: document.getElementById('simClicks').value,
            baseDroneYieldPerSec: document.getElementById('simBaseDrone').value,
            baseCatchYieldPerSec: document.getElementById('simBaseCatch').value,
        };

        const result = simulator.simulate(duration, inputs);
        
        // Update Timeline
        timelineData.innerHTML = '';
        result.events.forEach(e => {
            const row = document.createElement('div');
            const m = Math.floor(e.time / 60).toString().padStart(2, '0');
            const s = (e.time % 60).toString().padStart(2, '0');
            row.innerText = `[${m}:${s}] ${e.label}`;
            row.dataset.time = e.time;
            
            if (e.type === 'unlock') row.style.color = '#29B6F6';
            else if (e.type === 'upgrade') row.style.color = '#66BB6A';
            else if (e.type === 'building') row.style.color = '#FFC857';

            row.style.marginBottom = '2px';
            timelineData.appendChild(row);
        });

        // Display Unpurchased Upgrades
        const unpurchasedHeader = document.createElement('div');
        unpurchasedHeader.style.marginTop = '15px';
        unpurchasedHeader.style.paddingTop = '10px';
        unpurchasedHeader.style.borderTop = '1px solid #444';
        unpurchasedHeader.style.color = '#FF8A65';
        unpurchasedHeader.innerText = '--- End of Simulation: Unpurchased Upgrades ---';
        timelineData.appendChild(unpurchasedHeader);

        if (result.unpurchasedUpgrades && result.unpurchasedUpgrades.length > 0) {
            result.unpurchasedUpgrades.forEach(u => {
                const row = document.createElement('div');
                row.innerText = `- ${u.name} (Lvl ${u.level}/${u.maxLevel})${u.visible ? '' : ' [Locked]'}`;
                row.style.color = u.visible ? '#bbb' : '#666';
                row.style.marginBottom = '2px';
                timelineData.appendChild(row);
            });
        } else {
            const row = document.createElement('div');
            row.innerText = 'All upgrades purchased!';
            row.style.color = '#aaa';
            timelineData.appendChild(row);
        }

        // Update Charts
        const labels = result.history.map(h => {
            const m = Math.floor(h.time / 60);
            return `${m}m`;
        });

        const scrollToTimeline = (targetTime) => {
            let bestRow = null;
            let maxTimeBefore = -1;
            for (let i = 0; i < timelineData.children.length; i++) {
                const row = timelineData.children[i];
                if (row.dataset.time !== undefined) {
                    const time = parseFloat(row.dataset.time);
                    if (time <= targetTime && time >= maxTimeBefore) {
                        maxTimeBefore = time;
                        bestRow = row;
                    }
                }
            }
            if (bestRow) {
                bestRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                const oldBg = bestRow.style.backgroundColor;
                bestRow.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
                bestRow.style.transition = 'background-color 0.5s';
                setTimeout(() => {
                    bestRow.style.backgroundColor = oldBg || 'transparent';
                }, 1000);
            }
        };

        const chartOnClick = (e, activeElements, chart) => {
            const elements = chart.getElementsAtEventForMode(e, 'index', { intersect: false }, true);
            if (elements && elements.length > 0) {
                const dataIndex = elements[0].index;
                const targetTime = result.history[dataIndex].time;
                scrollToTimeline(targetTime);
            }
        };

        if (chartSpsInstance) chartSpsInstance.destroy();
        if (chartGpsInstance) chartGpsInstance.destroy();
        if (chartUpgradesInstance) chartUpgradesInstance.destroy();
        if (chartCrowdInstance) chartCrowdInstance.destroy();

        if (window.Chart) {
            Chart.defaults.color = '#ccc';
            
            chartSpsInstance = new Chart(document.getElementById('chart-sps'), {
                type: 'line',
                data: {
                    labels,
                    datasets: [
                        { label: 'Sparkles', data: result.history.map(h => h.sparkles), yAxisID: 'y1', borderColor: '#FFC857', pointRadius: 0 },
                        { label: 'Sparkles / sec', data: result.history.map(h => h.sps), yAxisID: 'y2', borderColor: '#F06292', pointRadius: 0 },
                        { label: 'Cheapest Cost', data: result.history.map(h => h.cheapestSparkle), yAxisID: 'y1', borderColor: '#81C784', borderDash: [5, 5], pointRadius: 0 }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    onClick: chartOnClick,
                    interaction: { mode: 'index', intersect: false },
                    scales: {
                        y1: { type: 'logarithmic', position: 'left', title: { display: true, text: 'Total Sparkles' } },
                        y2: { type: 'logarithmic', position: 'right', title: { display: true, text: 'SPS' } }
                    }
                }
            });

            chartGpsInstance = new Chart(document.getElementById('chart-gps'), {
                type: 'line',
                data: {
                    labels,
                    datasets: [
                        { label: 'Gold', data: result.history.map(h => h.gold), yAxisID: 'y1', borderColor: '#FFD700', pointRadius: 0 },
                        { label: 'Gold / sec', data: result.history.map(h => h.gps), yAxisID: 'y2', borderColor: '#FFA500', pointRadius: 0 },
                        { label: 'Cheapest Cost', data: result.history.map(h => h.cheapestGold), yAxisID: 'y1', borderColor: '#90CAF9', borderDash: [5, 5], pointRadius: 0 }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    onClick: chartOnClick,
                    interaction: { mode: 'index', intersect: false },
                    scales: {
                        y1: { type: 'logarithmic', position: 'left', title: { display: true, text: 'Total Gold' } },
                        y2: { type: 'linear', position: 'right', title: { display: true, text: 'GPS' } }
                    }
                }
            });

            chartUpgradesInstance = new Chart(document.getElementById('chart-upgrades'), {
                type: 'line',
                data: {
                    labels,
                    datasets: [
                        { label: 'Upgrades Purchased', data: result.history.map(h => h.upgrades), yAxisID: 'y1', borderColor: '#4CAF50', pointRadius: 0 }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    onClick: chartOnClick,
                    interaction: { mode: 'index', intersect: false },
                    scales: {
                        y1: { type: 'linear', position: 'left', title: { display: true, text: 'Total Upgrades' } }
                    }
                }
            });

            chartCrowdInstance = new Chart(document.getElementById('chart-crowd'), {
                type: 'line',
                data: {
                    labels,
                    datasets: [
                        { label: 'Crowd Size', data: result.history.map(h => h.crowd), yAxisID: 'y1', borderColor: '#29B6F6', pointRadius: 0 }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    onClick: chartOnClick,
                    interaction: { mode: 'index', intersect: false },
                    scales: {
                        y1: { type: 'linear', position: 'left', title: { display: true, text: 'Crowd Count' } }
                    }
                }
            });
        } else {
            console.warn('Chart.js not loaded!');
        }
    };
}
