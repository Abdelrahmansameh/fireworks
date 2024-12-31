import json
import sys
from datetime import datetime
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import os

def process_profile_data(data):
    """Process raw profile data into statistics and metrics"""
    processed_data = {
        'metadata': data['metadata'],
        'frameData': data['frameData'],
        'functionStats': data['functionStats'],
        'memoryStats': data['memoryStats'],
        'slowFrames': [
            frame for frame in data['frameData'] 
            if frame['totalTime'] > data['metadata']['config']['minFrameTimeMs']
        ]
    }
    
    total_time = processed_data['metadata']['totalFrames'] * processed_data['metadata']['averageFrameTime']
    if total_time > 0:
        for func_stats in processed_data['functionStats'].values():
            func_stats['percentOfTotal'] = (func_stats['totalTime'] / total_time) * 100
    
    return processed_data

def generate_frame_histogram(data):
    """Generate a histogram of frame times
    Expected data format:
    data = {
        'frameData': [{'totalTime': number, ...}, ...],
        'metadata': {'config': {'minFrameTimeMs': number}}
    }
    """
    frame_times = [frame['totalTime'] for frame in data['frameData']]
    
    fig = go.Figure(data=[
        go.Histogram(x=frame_times, nbinsx=50)
    ])
    
    fig.add_vline(
        x=data['metadata']['config']['minFrameTimeMs'],
        line_dash="dash", 
        line_color="red",
        annotation_text="60 FPS",
        annotation_position="top right"
    )
    
    fig.update_layout(
        title='Frame Time Distribution',
        xaxis_title='Frame Time (ms)',
        yaxis_title='Count',
        height=400
    )
    
    return fig.to_html(full_html=False)

def generate_combined_timings_plot(data):
    """Generate a combined timings plot showing function execution times
    Expected data format:
    data = {
        'functionStats': {
            'functionName': {
                'totalTime': number,
                'calls': number,
                'averageTimePerFrame': number,
                ...
            },
            ...
        }
    }
    """
    sorted_functions = sorted(
        data['functionStats'].items(),
        key=lambda x: x[1]['totalTime'],
        reverse=True
    )[:10]  

    func_names = []
    total_times = []
    avg_times = []
    call_counts = []
    
    for func_name, func_data in sorted_functions:
        func_names.append(func_name)
        total_times.append(func_data['totalTime'])
        avg_times.append(func_data['averageTimePerFrame'])
        call_counts.append(func_data['calls'])

    fig = go.Figure(data=[
        go.Bar(name='Total Time (ms)', x=func_names, y=total_times),
        go.Bar(name='Avg Time/Frame (ms)', x=func_names, y=avg_times)
    ])

    fig.update_layout(
        title='Function Timing Overview',
        xaxis_title='Function Name',
        yaxis_title='Time (ms)',
        barmode='group',
        height=400
    )

    return fig.to_html(full_html=False)

def generate_function_percentage_histogram(data):
    """Generate a histogram showing function time distribution
    Expected data format:
    data = {
        'functionStats': {
            'functionName': {
                'percentOfTotal': number,
                ...
            },
            ...
        }
    }
    """
    stats = data['functionStats']
    
    sorted_stats = sorted(
        [(name, stats[name]) for name in stats],
        key=lambda x: x[1]['percentOfTotal'],
        reverse=True
    )[:10]  
    
    names = []
    percentages = []
    
    for name, func_data in sorted_stats:
        names.append(name)
        percentages.append(func_data['percentOfTotal'])
    
    fig = go.Figure([
        go.Bar(
            x=percentages,
            y=names,
            orientation='h',
            text=[f'{p:.1f}%' for p in percentages],
            textposition='auto',
        )
    ])
    
    fig.update_layout(
        title='Function Time Distribution (% of Total Time)',
        xaxis_title='Percentage of Total Time',
        yaxis_title='Function Name',
        height=400,
        margin=dict(l=200) 
    )
    
    return fig.to_html(full_html=False)

def generate_function_breakdown(data):
    """Generate an interactive function breakdown visualization"""
    stats = data['functionStats']
    total_frames = len(data['frameData'])
    
    total_frame_time = sum(frame['totalTime'] for frame in data['frameData'])
    avg_frame_time = total_frame_time / total_frames if total_frames > 0 else 0
    
    function_options = ['<option value="__frame__">Full Frame</option>'] + [
        f'<option value="{name}">{name}</option>'
        for name in sorted(stats.keys())
    ]
    
    breakdown_div = f"""
    <div id="function-breakdown" style="margin-bottom: 20px;">
        <div style="display: flex; align-items: center; gap: 20px; margin-bottom: 10px;">
            <select id="function-selector" onchange="updateFunctionBreakdown()" style="flex-grow: 1;">
                {''.join(function_options)}
            </select>
            <label style="display: flex; align-items: center; gap: 5px;">
                <input type="checkbox" id="show-averages" onchange="updateFunctionBreakdown()">
                Show Averages per Frame
            </label>
        </div>
        <div id="function-pie-chart"></div>
    </div>
    """
    
    script = """
    <script>
    function updateFunctionBreakdown() {
        const functionStats = """ + json.dumps(stats) + """;
        const totalFrames = """ + str(total_frames) + """;
        const totalFrameTime = """ + str(total_frame_time) + """;
        const functionName = document.getElementById('function-selector').value;
        const showAverages = document.getElementById('show-averages').checked;
        
        let values, labels, totalTime;
        
        if (functionName === '__frame__') {
            const rootFunctions = Object.entries(functionStats)
                .filter(([_, data]) => data.parents.length === 0)
                .sort((a, b) => b[1].totalTime - a[1].totalTime);
                
            totalTime = totalFrameTime;
            if (showAverages) {
                values = rootFunctions.map(([_, data]) => data.totalTime / totalFrames);
            } else {
                values = rootFunctions.map(([_, data]) => data.totalTime);
            }
            labels = rootFunctions.map(([name, _]) => name);
            
        } else {
            const func = functionStats[functionName];
            if (!func) return;
            
            totalTime = func.totalTime;
            const childTimes = new Map();
            
            func.children.forEach(childName => {
                const childStats = functionStats[childName];
                if (childStats) {
                    childTimes.set(childName, childStats.totalTime);
                }
            });
            
            const childTimeSum = Array.from(childTimes.values()).reduce((a, b) => a + b, 0);
            const selfTime = Math.max(0, totalTime - childTimeSum);
            
            const sortedChildren = Array.from(childTimes.entries())
                .sort((a, b) => b[1] - a[1]);
            
            if (showAverages) {
                values = [selfTime / totalFrames, ...sortedChildren.map(([_, time]) => time / totalFrames)];
            } else {
                values = [selfTime, ...sortedChildren.map(([_, time]) => time)];
            }
            labels = ['Self Time', ...sortedChildren.map(([name, _]) => name)];
        }
        
        const timeUnit = showAverages ? 'ms/frame' : 'ms total';
        const percentages = values.map(v => ((v * (showAverages ? totalFrames : 1)) / totalTime * 100).toFixed(1));
        
        const hovertext = values.map((v, i) => 
            `${labels[i]}<br>${v.toFixed(2)} ${timeUnit} (${percentages[i]}%)`
        );
        
        const pieData = [{
            values: values,
            labels: labels,
            type: 'pie',
            textposition: 'outside',
            textinfo: 'label+percent',
            hovertext: hovertext,
            hoverinfo: 'text',
            showlegend: true,
            automargin: true
        }];
        
        const layout = {
            title: {
                text: `Time Breakdown for ${functionName === '__frame__' ? 'Full Frame' : functionName}<br>` +
                      `${showAverages ? 'Average: ' + (totalTime / totalFrames).toFixed(2) + ' ms/frame' : 
                                      'Total: ' + totalTime.toFixed(2) + ' ms'}`,
                font: { size: 16 }
            },
            height: 500,
            margin: {
                l: 50,
                r: 50,
                t: 80,
                b: 50
            },
            showlegend: true,
            legend: {
                orientation: 'h',
                yanchor: 'bottom',
                y: -0.5,
                xanchor: 'center',
                x: 0.5
            }
        };
        
        const config = {
            responsive: true,
            displayModeBar: true,
            modeBarButtonsToRemove: ['select2d', 'lasso2d']
        };
        
        Plotly.newPlot('function-pie-chart', pieData, layout, config);
    }
    
    document.addEventListener('DOMContentLoaded', function() {
        const selector = document.getElementById('function-selector');
        if (selector.options.length > 0) {
            updateFunctionBreakdown();
        }
    });
    </script>
    """
    
    return breakdown_div + script

def generate_function_stats_table(data):
    """Generate an HTML table of function statistics
    Expected data format:
    data = {
        'functionStats': {
            'functionName': {
                'totalTime': number,
                'calls': number,
                'timePerFrame': number[],
                'percentOfTotal': number
            },
            ...
        }
    }
    """
    stats = data['functionStats']
    total_frames = len(data['frameData'])
    
    # Sort functions by total time percentage
    sorted_funcs = sorted(
        stats.items(),
        key=lambda x: x[1]['percentOfTotal'],
        reverse=True
    )
    
    table_rows = []
    for name, func_data in sorted_funcs:
        # Calculate total calls by summing calls across all frames
        total_calls = func_data['calls']
        
        # Calculate average time per call
        avg_time_per_call = func_data['totalTime'] / total_calls if total_calls > 0 else func_data['totalTime']
        
        # Calculate average time per frame
        avg_time_per_frame = func_data['totalTime'] / total_frames if total_frames > 0 else 0
        
        row = f"""
        <tr>
            <td>{name}</td>
            <td>{func_data['totalTime']:.2f}ms</td>
            <td>{avg_time_per_call:.2f}ms</td>
            <td>{avg_time_per_frame:.2f}ms</td>
            <td>{total_calls}</td>
            <td>{func_data['percentOfTotal']:.1f}%</td>
        </tr>
        """
        table_rows.append(row)
    
    table = f"""
    <div class="stats-table">
        <h3>Function Statistics</h3>
        <table>
            <tr>
                <th>Function</th>
                <th>Total Time</th>
                <th>Avg Time/Call</th>
                <th>Avg Time/Frame</th>
                <th>Calls</th>
                <th>% of Total</th>
            </tr>
            {''.join(table_rows)}
        </table>
    </div>
    """
    
    return table

def generate_memory_chart(data):
    """Generate a line chart showing memory usage over time"""
    if not data['memoryStats']:
        return "<div>No memory data available</div>"
        
    snapshots = data['memoryStats']
    timestamps = [(s['timestamp'] - data['metadata']['startTime']) / 1000 for s in snapshots]
    used_memory = [s['used'] / (1024 * 1024) for s in snapshots]  # Convert to MB
    total_memory = [s['total'] / (1024 * 1024) for s in snapshots]  # Convert to MB
    
    fig = go.Figure()
    
    fig.add_trace(go.Scatter(
        x=timestamps,
        y=used_memory,
        name='Used Memory (MB)',
        line=dict(color='blue')
    ))
    
    fig.add_trace(go.Scatter(
        x=timestamps,
        y=total_memory,
        name='Total Memory (MB)',
        line=dict(color='red', dash='dash')
    ))
    
    fig.update_layout(
        title='Memory Usage Over Time',
        xaxis_title='Time (seconds)',
        yaxis_title='Memory (MB)',
        height=400
    )
    
    return fig.to_html(full_html=False)

def generate_html_report(profile_data):
    combined_timings = generate_combined_timings_plot(profile_data)
    frame_histogram = generate_frame_histogram(profile_data)
    function_percentages = generate_function_percentage_histogram(profile_data)
    function_breakdown = generate_function_breakdown(profile_data)
    function_stats_table = generate_function_stats_table(profile_data)
    memory_chart = generate_memory_chart(profile_data)
    
    avg_frame_time = profile_data['metadata']['averageFrameTime']
    total_frames = profile_data['metadata']['totalFrames']
    slow_frames = len(profile_data['slowFrames'])
    slow_frame_percentage = (slow_frames / total_frames) * 100 if total_frames > 0 else 0
    
    html = f"""
    <!DOCTYPE html>
    <html>
        <head>
            <title>Performance Profile Report</title>
            <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
            <style>
                body {{
                    font-family: Arial, sans-serif;
                    margin: 0;
                    padding: 20px;
                    background-color: #f5f5f5;
                }}
                
                .container {{
                    max-width: 1200px;
                    margin: 0 auto;
                    background-color: white;
                    padding: 20px;
                    border-radius: 5px;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.1);
                }}
                
                .header {{
                    text-align: center;
                    margin-bottom: 30px;
                }}
                
                .summary {{
                    display: flex;
                    justify-content: space-around;
                    margin-bottom: 30px;
                    flex-wrap: wrap;
                }}
                
                .summary-item {{
                    text-align: center;
                    padding: 15px;
                    background-color: #f8f9fa;
                    border-radius: 5px;
                    margin: 10px;
                    flex: 1;
                    min-width: 200px;
                }}
                
                .summary-item h3 {{
                    margin: 0;
                    color: #666;
                }}
                
                .summary-item p {{
                    margin: 10px 0 0 0;
                    font-size: 24px;
                    font-weight: bold;
                    color: #333;
                }}
                
                .chart-container {{
                    margin-bottom: 30px;
                    padding: 20px;
                    background-color: white;
                    border-radius: 5px;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.1);
                }}
                
                .section {{
                    margin-bottom: 40px;
                }}
                
                table {{
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 20px;
                }}
                
                th, td {{
                    padding: 12px;
                    text-align: left;
                    border-bottom: 1px solid #ddd;
                }}
                
                th {{
                    background-color: #f8f9fa;
                    font-weight: bold;
                }}
                
                tr:hover {{
                    background-color: #f5f5f5;
                }}
                
                .warning {{
                    color: #856404;
                    background-color: #fff3cd;
                    border: 1px solid #ffeeba;
                    padding: 12px;
                    border-radius: 4px;
                    margin-bottom: 20px;
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Performance Profile Report</h1>
                </div>
                
                <div class="summary">
                    <div class="summary-item">
                        <h3>Average Frame Time</h3>
                        <p>{avg_frame_time:.2f}ms</p>
                    </div>
                    <div class="summary-item">
                        <h3>Total Frames</h3>
                        <p>{total_frames}</p>
                    </div>
                    <div class="summary-item">
                        <h3>Slow Frames</h3>
                        <p>{slow_frames} ({slow_frame_percentage:.1f}%)</p>
                    </div>
                </div>
                
                {f'<div class="warning">Warning: {slow_frame_percentage:.1f}% of frames exceeded the target frame time.</div>' if slow_frame_percentage > 5 else ''}
                
                <div class="section">
                    <div class="chart-container">
                        <h3>Frame Time Distribution</h3>
                        {frame_histogram}
                    </div>
                    
                    <div class="chart-container">
                        <h3>Memory Usage</h3>
                        {memory_chart}
                    </div>
                    
                    <div class="chart-container">
                        <h3>Function Timing Overview</h3>
                        {combined_timings}
                    </div>
                    
                    <div class="chart-container">
                        <h3>Function Time Distribution</h3>
                        {function_percentages}
                    </div>
                    
                    <div class="chart-container">
                        <h3>Function Breakdown</h3>
                        {function_breakdown}
                    </div>
                    
                    <div class="chart-container">
                        <h3>Function Statistics</h3>
                        {function_stats_table}
                    </div>
                </div>
            </div>
        </body>
    </html>
    """
    
    return html

def main():
    if len(sys.argv) != 2:
        print("Usage: python profile_analyzer.py <profile_data.json>")
        sys.exit(1)
    
    input_file = sys.argv[1]
    
    with open(input_file, 'r') as f:
        profile_data = json.load(f)
    
    profile_data = process_profile_data(profile_data)
    
    html_report = generate_html_report(profile_data)
    output_file = os.path.splitext(input_file)[0] + '_report.html'
    
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(html_report)
    
    print(f"Report generated: {output_file}")

if __name__ == "__main__":
    main()
