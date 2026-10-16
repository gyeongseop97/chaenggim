(() => {
  'use strict';

  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const temperature = value => finite(value) ? Math.round(value) + '°' : '—';
  const probability = value => finite(value) ? Math.round(Math.max(0, Math.min(100, value))) + '%' : '—';

  function weatherTone(row) {
    if(row.condition === '눈') return 'snow';
    if(row.condition === '뇌우') return 'storm';
    if(row.condition === '비' || row.condition === '비/눈') return 'rain';
    if(row.condition === '안개') return 'fog';
    if(row.condition === '맑음') return row.isDay ? 'sunny' : 'night';
    if(row.condition === '구름 조금') return row.isDay ? 'partly' : 'night';
    return 'cloudy';
  }

  function weatherIcon(row) {
    if(row.condition === '눈') return 'snowflake';
    if(row.condition === '뇌우') return 'cloud-lightning';
    if(row.condition === '비' || row.condition === '비/눈') return 'cloud-rain';
    if(row.condition === '안개') return 'cloud-fog';
    if(row.condition === '맑음') return row.isDay ? 'sun' : 'moon';
    if(row.condition === '구름 조금') return row.isDay ? 'cloud-sun' : 'cloud-moon';
    return 'cloud';
  }

  function dayLabel(date, today) {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\d{4}-\d{2}-\d{2}$/.test(today || '')) return '';
    const days = Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000);
    if(days === 0) return '';
    if(days === 1) return '내일';
    if(days === 2) return '모레';
    return Number(date.slice(5,7)) + '월 ' + Number(date.slice(8,10)) + '일';
  }

  function timeLabel(row, context) {
    const hour = Number.isInteger(row.hour) ? row.hour : Number(String(row.stamp).slice(11,13));
    const label = Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour + '시' : '—';
    const day = dayLabel(row.date, context.date);
    return (day ? day + ' ' : '') + label;
  }

  function render(source, context = {}) {
    const available = (Array.isArray(source) ? source : []).slice(0,24).filter(row => row && finite(row.temp));
    if(!available.length) return '<figure class="hourly-chart hourly-chart-empty" aria-label="기온 그래프"><figcaption>기온 변화</figcaption><p>시간별 날씨를 불러오면 그래프가 표시돼요.</p></figure>';

    const indexes = Array.from(new Set([0,3,6,9,12,15,18,21,23].filter(index => index < available.length).concat(available.length - 1)));
    const rows = indexes.map(index => available[index]);
    const count = rows.length;
    const width = Math.max(count * 54, 108);
    const height = 150;
    const temperatures = rows.map(row => row.temp);
    const lowest = Math.min(...temperatures), highest = Math.max(...temperatures);
    const padding = Math.max(2, (highest - lowest) * 0.2);
    const domainLow = lowest - padding, domainHigh = highest + padding;
    const points = rows.map((row,index) => ({
      x: count === 1 ? width / 2 : 27 + index * (width - 54) / (count - 1),
      y: 30 + (domainHigh - row.temp) / (domainHigh - domainLow) * 92
    }));
    const coordinate = value => Number(value.toFixed(2));
    const path = points.map((point,index) => {
      if(index === 0) return 'M ' + coordinate(point.x) + ' ' + coordinate(point.y);
      const previous = points[index - 1], middle = (previous.x + point.x) / 2;
      return 'C ' + coordinate(middle) + ' ' + coordinate(previous.y) + ' ' + coordinate(middle) + ' ' + coordinate(point.y) + ' ' + coordinate(point.x) + ' ' + coordinate(point.y);
    }).join(' ');
    const fillPath = path + ' L ' + coordinate(points[count - 1].x) + ' ' + height + ' L ' + coordinate(points[0].x) + ' ' + height + ' Z';
    const summary = rows.map(row => timeLabel(row, context) + ' ' + row.condition + ', 기온 ' + temperature(row.temp) + ', 강수확률 ' + probability(row.rain)).join('; ');
    const top = rows.map((row,index) => '<div class="hourly-chart-column" data-weather-tone="' + weatherTone(row) + '"' + (index === 0 ? ' data-current="true"' : '') + '><span class="hourly-chart-time">' + escape(timeLabel(row,context)) + '</span><i class="hourly-chart-weather-icon" data-lucide="' + weatherIcon(row) + '" aria-hidden="true"></i><span class="hourly-chart-condition">' + escape(row.condition) + '</span><span class="hourly-chart-rain" aria-label="강수확률 ' + escape(probability(row.rain)) + '">' + escape(probability(row.rain)) + '</span></div>').join('');
    const labels = points.map((point,index) => '<span class="hourly-chart-point" style="left:' + coordinate(point.x / width * 100) + '%;top:' + coordinate(point.y) + 'px"><b>' + escape(temperature(rows[index].temp)) + '</b><span class="hourly-chart-dot"></span></span>').join('');
    const guides = points.map(point => '<line x1="' + coordinate(point.x) + '" x2="' + coordinate(point.x) + '" y1="0" y2="' + height + '"/>').join('');

    return '<figure class="hourly-chart" aria-label="앞으로 24시간 기온과 강수확률 그래프"><figcaption class="hourly-chart-caption"><span class="hourly-chart-heading">기온 변화 <small>°C</small></span><span class="hourly-chart-hint">좌우로 보기 <i data-lucide="move-horizontal" aria-hidden="true"></i></span></figcaption><div class="hourly-chart-scroll" tabindex="0" role="region" aria-label="기온 그래프, 좌우로 스크롤할 수 있어요"><div class="hourly-chart-track" style="--chart-width:' + width + 'px;--chart-columns:' + count + '"><div class="hourly-chart-columns" aria-hidden="true">' + top + '</div><div class="hourly-chart-plot" aria-hidden="true"><svg viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none" focusable="false"><g class="hourly-chart-guides">' + guides + '</g><path class="hourly-chart-fill" d="' + fillPath + '"/><path class="hourly-chart-line" d="' + path + '"/></svg>' + labels + '</div></div></div><p class="hourly-chart-description">' + escape(summary) + '</p><div class="hourly-chart-legend" aria-hidden="true"><span><span class="hourly-chart-legend-line"></span>기온</span><span><i data-lucide="droplets"></i>강수확률</span></div></figure>';
  }

  window.ChaenggimChart = Object.freeze({ render, weatherTone, weatherIcon, dayLabel });
})();
