(function (scope) {
  'use strict';

  // The UI and the push worker share these rules. Dates in forecast rows are
  // local wall-clock times; now can also be a Date, epoch, or an ISO instant.
  const adjustments = Object.freeze({cold:-3,normal:0,hot:3});
  const purposeNames = {daily:'외출',commute:'출근',exercise:'운동',walk:'산책',trip:'나들이',appointment:'약속'};
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const temperature = value => finite(value) && value >= -100 && value <= 100;
  const probability = value => finite(value) && value >= 0 && value <= 100;
  const degrees = value => Math.round(value)+'°';
  const pad = value => String(value).padStart(2,'0');
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value+'T12:00:00Z')) && new Date(value+'T12:00:00Z').toISOString().slice(0,10) === value;
  const timeHour = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
    ? Number(value.slice(0,2))+Number(value.slice(3,5))/60 : null;
  const wet = value => typeof value === 'string' && /비|눈|뇌우|rain|snow|sleet|drizzle|thunder/i.test(value);
  const shortName = value => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,40) : '';

  function localClock(value,timeZone) {
    if(value && typeof value === 'object' && validDate(value.date) && finite(value.hour) && value.hour >= 0 && value.hour < 24) {
      return {date:value.date,hour:value.hour};
    }
    if(typeof value === 'string') {
      const local = value.match(/^(\d{4}-\d{2}-\d{2})(?:T([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d+)?)?)?$/);
      if(local && validDate(local[1]))return {date:local[1],hour:Number(local[2]||0)+Number(local[3]||0)/60};
    }
    const instant = value === undefined ? new Date() : value instanceof Date ? value : new Date(value);
    if(!Number.isFinite(instant.getTime()))return null;
    let formatter;
    try { formatter = new Intl.DateTimeFormat('en-GB',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}); }
    catch { formatter = new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}); }
    const parts = Object.fromEntries(formatter.formatToParts(instant).map(part=>[part.type,part.value]));
    return {date:parts.year+'-'+parts.month+'-'+parts.day,hour:Number(parts.hour)+Number(parts.minute)/60};
  }

  function normalizeRow(value) {
    if(!value || typeof value !== 'object')return null;
    const stamp = typeof value.stamp === 'string' ? value.stamp.match(/^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/) : null;
    const date = stamp ? stamp[1] : value.date;
    const hour = stamp ? Number(stamp[2])+Number(stamp[3])/60 : value.hour;
    if(!validDate(date) || !finite(hour) || hour < 0 || hour >= 24)return null;
    const temp = temperature(value.temp) ? value.temp : null;
    const feels = temperature(value.feels) ? value.feels : temp;
    const rain = probability(value.rain) ? value.rain : null;
    const condition = typeof value.condition === 'string' ? value.condition.slice(0,40) : '';
    if(temp === null && feels === null && rain === null && !condition)return null;
    return {date,hour,temp,feels,rain,condition,hasFeels:temperature(value.feels)};
  }

  function stampAt(date,hour) {
    if(hour >= 24) {
      const next = new Date(date+'T12:00:00Z');
      next.setUTCDate(next.getUTCDate()+1);
      return next.toISOString().slice(0,10)+'T00:00';
    }
    const minutes = Math.floor(hour*60+0.000001);
    return date+'T'+pad(Math.floor(minutes/60))+':'+pad(minutes%60);
  }

  function clothes(low,purpose) {
    if(!finite(low))return [];
    if(purpose === 'exercise') {
      if(low < 5)return ['기능성 긴팔','운동용 긴바지','보온 재킷','운동화'];
      if(low < 12)return ['기능성 긴팔','운동용 긴바지','가벼운 재킷','운동화'];
      if(low < 20)return ['기능성 상의','운동용 하의','얇은 바람막이','운동화'];
      return ['통기성 좋은 운동복','가벼운 운동용 하의','운동화'];
    }
    if(low < 5)return ['따뜻한 니트','두꺼운 긴바지','패딩 또는 겨울 코트','따뜻한 신발'];
    if(low < 12)return ['긴팔 또는 니트','긴바지','도톰한 재킷 또는 코트','편한 신발'];
    if(low < 18)return ['얇은 긴팔','편한 긴바지','가디건 또는 가벼운 재킷','운동화'];
    if(low < 23)return ['반팔 또는 얇은 긴팔','긴바지','얇은 셔츠 또는 가디건','편한 신발'];
    if(low < 28)return ['통기성 좋은 반팔','가벼운 바지','필요하면 얇은 셔츠','편한 신발'];
    return ['시원한 반팔','얇은 바지 또는 반바지','가벼운 신발'];
  }

  function analyze(input) {
    input = input && typeof input === 'object' ? input : {};
    const preference = Object.hasOwn(adjustments,input.preference) ? input.preference : 'normal';
    const clock = localClock(input.now,input.timeZone || 'Asia/Seoul');
    const date = validDate(input.date) ? input.date : clock?.date;
    const candidate = input.schedule;
    const start = timeHour(candidate?.start),end = timeHour(candidate?.end);
    const schedule = candidate && candidate.enabled !== false && start !== null && end !== null && start < end ? candidate : null;
    const purpose = Object.hasOwn(purposeNames,schedule?.purpose) ? schedule.purpose : 'daily';
    const name = schedule ? shortName(schedule.name) || purposeNames[purpose] : '외출';
    const current = input.current && typeof input.current === 'object' ? input.current : {};
    const result = {
      valid:false,basis:'unavailable',preference,purpose,scheduleName:schedule ? name : null,
      low:null,high:null,pop:null,outfitLow:null,outfitHigh:null,outfitPieces:[],outfitSource:null,
      summary:'예보를 확인하면 외출 준비를 알려드릴게요.',notifyReasons:[],notificationBody:'',
      requiresUmbrella:false,requiresOuter:false,prepItems:[],window:null,rainAt:null,departureTemp:null,returnTemp:null
    };
    if(!clock || !date)return result;
    const from = Math.max(schedule ? start : 0,date === clock.date ? clock.hour : 0);
    const until = schedule ? end : 24;
    result.window = {date,start:stampAt(date,Math.min(from,24)),end:stampAt(date,until),startHour:from,endHour:until,active:!!schedule && date === clock.date && clock.hour >= start && clock.hour < end};
    if(date < clock.date || from >= until)return result;

    // Hourly values describe that hour, including the return hour. Rows outside
    // this outing never influence its outfit, preparation, or notifications.
    const points = (Array.isArray(input.rows) ? input.rows : []).map(normalizeRow).filter(Boolean)
      .filter(row=>row.date === date && row.hour >= Math.floor(from) && row.hour <= until)
      .sort((left,right)=>left.hour-right.hour);
    const actual = points.filter(row=>row.temp !== null);
    const apparent = points.filter(row=>row.feels !== null);
    const chances = points.filter(row=>row.rain !== null).map(row=>row.rain);
    const currentTemp = temperature(current.temp) ? current.temp : null;
    const currentFeels = temperature(current.feels) ? current.feels : currentTemp;
    const hasCurrent = date === clock.date && currentTemp !== null;
    const hasForecast = actual.length > 0 || apparent.length > 0 || chances.length > 0 || points.some(row=>wet(row.condition));
    if(!hasForecast && !hasCurrent)return result;
    result.valid = true;
    result.basis = hasForecast ? 'forecast' : 'current';
    result.low = actual.length ? Math.min(...actual.map(row=>row.temp)) : hasCurrent ? currentTemp : null;
    result.high = actual.length ? Math.max(...actual.map(row=>row.temp)) : hasCurrent ? currentTemp : null;
    result.pop = chances.length ? Math.max(...chances) : null;
    const apparentValues = apparent.length ? apparent.map(row=>row.feels) : hasCurrent && currentFeels !== null ? [currentFeels] : [];
    if(apparentValues.length) {
      result.outfitLow = Math.min(...apparentValues)+adjustments[preference];
      result.outfitHigh = Math.max(...apparentValues)+adjustments[preference];
      result.outfitSource = apparent.length ? apparent.every(row=>row.hasFeels) ? 'feels' : apparent.some(row=>row.hasFeels) ? 'mixed' : 'temperature' : temperature(current.feels) ? 'feels' : 'temperature';
      result.outfitPieces = clothes(result.outfitLow,purpose);
    }
    if(!hasForecast) {
      result.summary = '지금 기온은 '+degrees(currentTemp)+'예요. 외출 시간대 예보가 연결되면 준비물을 알려드릴게요.';
      return result;
    }

    const first = actual[0],last = actual.at(-1);
    const hasDeparture = !!first && first.hour === Math.floor(from);
    const hasReturn = !!last && last.hour === Math.floor(until);
    result.departureTemp = hasDeparture ? first.temp : null;
    result.returnTemp = schedule && hasReturn ? last.temp : null;
    const firstFeels = apparent[0]?.feels;
    const firstEquivalent = finite(firstFeels) ? firstFeels+adjustments[preference] : null;
    const drop = finite(firstEquivalent) && finite(result.outfitLow) ? firstEquivalent-result.outfitLow : 0;
    const rainy = points.find(row=>wet(row.condition) || row.rain !== null && row.rain >= 50);
    const imminent = date === clock.date && from <= clock.hour+1;
    const rainingNow = imminent && wet(current.condition);
    const rainKind = /눈|snow|sleet/i.test(rainy?.condition || (rainingNow ? current.condition : '')) ? '눈' : '비';
    const rainDetail = rainy ? Math.floor(rainy.hour)+'시 전후 '+rainKind+' 가능성이 있어요' : '지금 '+rainKind+' 소식이 있어요';
    result.requiresUmbrella = !!rainy || rainingNow;
    result.rainAt = rainy ? stampAt(rainy.date,rainy.hour) : rainingNow ? stampAt(date,clock.hour) : null;
    result.requiresOuter = finite(result.outfitLow) && result.outfitLow < 18;
    const outerLabel = finite(result.outfitLow) && result.outfitLow < 12 ? '따뜻한 겉옷' : '얇은 겉옷';
    const outerDetail = result.low !== null ? '외출 중 기온이 '+degrees(result.low)+'까지 내려갈 수 있어요' : '외출 시간의 체감온도에 맞춰 챙겨요';
    if(result.requiresUmbrella) {
      result.prepItems.push({icon:'umbrella',name:'접이식 우산',detail:rainDetail});
      result.notifyReasons.push({kind:'umbrella',label:'접이식 우산',detail:rainDetail});
    }
    if(result.requiresOuter)result.prepItems.push({icon:'shirt',name:outerLabel,detail:outerDetail});
    const outerNotify = result.requiresOuter && (result.outfitLow < 12 || firstEquivalent !== null && firstEquivalent >= 18 || drop >= 6);
    if(outerNotify)result.notifyReasons.push({kind:'outer',label:outerLabel,detail:outerDetail});
    if(purpose === 'exercise')result.prepItems.push({icon:'droplets',name:'물병',detail:'운동 중 수분을 챙겨요'},{icon:'layers',name:'작은 수건',detail:'운동 후 가볍게 사용해요'});
    else {
      if(result.high !== null && result.high >= 26)result.prepItems.push({icon:'droplets',name:'물병',detail:'외출 중 '+degrees(result.high)+'까지 올라갈 수 있어요'});
      if(purpose === 'trip')result.prepItems.push({icon:'battery-charging',name:'보조 배터리',detail:'긴 외출에 여유를 더해요'});
      if(purpose === 'walk' && !result.prepItems.length)result.prepItems.push({icon:'footprints',name:'편한 신발',detail:'걷기 좋은 신발을 골라요'});
    }
    if(!result.prepItems.length)result.prepItems.push({icon:'check',name:'가볍게 나가도 좋아요',detail:'추가 날씨 준비물이 적어요'});

    let lead = '';
    if(first && last && first.temp-last.temp >= 4 && points.length > 1 && (!schedule || hasDeparture && hasReturn)) {
      lead = schedule
        ? name+(result.window.active ? ' 중엔 ' : '에 나설 땐 ')+degrees(first.temp)+'지만, 돌아올 땐 '+degrees(last.temp)+'예요.'
        : (hasDeparture ? '지금은 ' : Math.floor(first.hour)+'시엔 ')+degrees(first.temp)+'지만, '+Math.floor(last.hour)+'시엔 '+degrees(last.temp)+'로 내려가요.';
    } else if(result.low !== null && result.high !== null) {
      const range = Math.round(result.low) === Math.round(result.high) ? degrees(result.low) : Math.round(result.low)+'–'+degrees(result.high);
      lead = (schedule ? name+' 시간엔 ' : '오늘 남은 시간엔 ')+range+'예요.';
    }
    const extras = [];
    if(result.requiresUmbrella)extras.push(rainDetail+'.');
    const preparations = [result.requiresUmbrella ? '우산' : '',result.requiresOuter ? outerLabel : ''].filter(Boolean);
    if(preparations.length)extras.push(preparations.join('과 ')+'을 챙기세요.');
    else if(result.high !== null && result.high >= 26)extras.push('가벼운 옷과 물을 챙기세요.');
    else if(lead)extras.push('편한 차림으로 나가도 좋아요.');
    result.summary = [lead,...extras].filter(Boolean).join(' ') || result.summary;
    if(result.notifyReasons.length) {
      const labels = result.notifyReasons.map(reason=>reason.label);
      result.notificationBody = name+' 전, '+labels.join('과 ')+'을 챙기세요. '+(result.requiresUmbrella ? rainDetail : outerDetail)+'.';
    }
    return result;
  }

  const api = Object.freeze({version:1,analyze,adjustments});
  scope.ChaenggimAdvice = api;
})(globalThis);
