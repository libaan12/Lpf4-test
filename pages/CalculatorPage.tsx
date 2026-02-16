
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { playSound } from '../services/audioService';

type AngleMode = 'DEG' | 'RAD';

const CalculatorPage: React.FC = () => {
  const navigate = useNavigate();
  
  // Display State
  const [expression, setExpression] = useState('');
  const [result, setResult] = useState('');
  const [prevAns, setPrevAns] = useState('0');
  const [memory, setMemory] = useState('0'); 
  
  // Calculator State
  const [isShift, setIsShift] = useState(false);
  const [isAlpha, setIsAlpha] = useState(false);
  const [angleMode, setAngleMode] = useState<AngleMode>('DEG');
  const [isMenuOpen, setIsMenuOpen] = useState(false); 
  const [cursorBlink, setCursorBlink] = useState(true);
  const [hypMode, setHypMode] = useState(false);
  const [sciMode, setSciMode] = useState(false);

  // Blink cursor effect
  useEffect(() => {
    const interval = setInterval(() => setCursorBlink(b => !b), 500);
    return () => clearInterval(interval);
  }, []);

  const safeEval = (expr: string) => {
    try {
      if (!expr) return '';

      let evalStr = expr
        .replace(/×/g, '*')
        .replace(/÷/g, '/')
        .replace(/π/g, 'Math.PI')
        .replace(/e/g, 'Math.E')
        .replace(/\^/g, '**')
        .replace(/Ans/g, `(${prevAns})`)
        .replace(/M/g, `(${memory})`)
        .replace(/Ran#/g, 'Math.random()');

      const toRad = (n: number) => angleMode === 'DEG' ? n * (Math.PI / 180) : n;
      const toDeg = (n: number) => angleMode === 'DEG' ? n * (180 / Math.PI) : n;

      const factorial = (n: number): number => {
          if (n < 0) return NaN;
          if (n <= 1) return 1;
          return n * factorial(n - 1);
      };

      const nPr = (n: number, r: number) => factorial(n) / factorial(n - r);
      const nCr = (n: number, r: number) => factorial(n) / (factorial(r) * factorial(n - r));

      const Pol = (x: number, y: number) => {
          const r = Math.sqrt(x*x + y*y);
          const theta = toDeg(Math.atan2(y, x));
          return `r=${r.toFixed(4)}, θ=${theta.toFixed(4)}`;
      };

      const Rec = (r: number, theta: number) => {
          const x = r * Math.cos(toRad(theta));
          const y = r * Math.sin(toRad(theta));
          return `x=${x.toFixed(4)}, y=${y.toFixed(4)}`;
      };

      const scope = {
        sin: (x: number) => Math.sin(toRad(x)),
        cos: (x: number) => Math.cos(toRad(x)),
        tan: (x: number) => Math.tan(toRad(x)),
        asin: (x: number) => toDeg(Math.asin(x)),
        acos: (x: number) => toDeg(Math.acos(x)),
        atan: (x: number) => toDeg(Math.atan(x)),
        sinh: Math.sinh,
        cosh: Math.cosh,
        tanh: Math.tanh,
        asinh: Math.asinh,
        acosh: Math.acosh,
        atanh: Math.atanh,
        sqrt: Math.sqrt,
        cbrt: Math.cbrt,
        log: Math.log10,
        ln: Math.log,
        exp: Math.exp,
        pow: Math.pow,
        abs: Math.abs,
        fact: factorial,
        nPr: nPr,
        nCr: nCr,
        Pol: Pol,
        Rec: Rec
      };

      evalStr = evalStr
        .replace(/sinh/g, 'scope.sinh')
        .replace(/cosh/g, 'scope.cosh')
        .replace(/tanh/g, 'scope.tanh')
        .replace(/sin⁻¹/g, 'scope.asin')
        .replace(/cos⁻¹/g, 'scope.acos')
        .replace(/tan⁻¹/g, 'scope.atan')
        .replace(/sin/g, 'scope.sin')
        .replace(/cos/g, 'scope.cos')
        .replace(/tan/g, 'scope.tan')
        .replace(/log/g, 'scope.log')
        .replace(/ln/g, 'scope.ln')
        .replace(/√/g, 'scope.sqrt')
        .replace(/∛/g, 'scope.cbrt')
        .replace(/P/g, ',scope.nPr,') 
        .replace(/C/g, ',scope.nCr,')
        .replace(/(\d+(?:\.\d+)?)P(\d+(?:\.\d+)?)/g, 'scope.nPr($1,$2)')
        .replace(/(\d+(?:\.\d+)?)C(\d+(?:\.\d+)?)/g, 'scope.nCr($1,$2)')
        .replace(/Pol\(/g, 'scope.Pol(')
        .replace(/Rec\(/g, 'scope.Rec(')
        .replace(/(\d+)!/g, 'scope.fact($1)');

      // eslint-disable-next-line no-new-func
      const func = new Function('scope', `with(scope) { return ${evalStr} }`);
      const res = func(scope);
      
      if (typeof res === 'string') return res;
      if (isNaN(res) || !isFinite(res)) return 'Math Error';
      
      if (sciMode) {
          return res.toExponential(4);
      }
      return parseFloat(res.toFixed(10)).toString(); 
    } catch (e) {
      return 'Syntax Error';
    }
  };

  const handlePress = (key: string, type: 'num' | 'op' | 'func' | 'action' | 'menu') => {
    playSound('click');

    if (isMenuOpen) {
      if (key === '1') { setAngleMode('DEG'); setIsMenuOpen(false); setIsShift(false); return; }
      if (key === '2') { setAngleMode('RAD'); setIsMenuOpen(false); setIsShift(false); return; }
      if (key === 'AC' || key === 'ON') { setIsMenuOpen(false); setIsShift(false); return; }
      return; 
    }

    if (key === 'SHIFT') { setIsShift(!isShift); setIsAlpha(false); return; }
    if (key === 'ALPHA') { setIsAlpha(!isAlpha); setIsShift(false); return; }
    if (key === 'hyp') { setHypMode(!hypMode); return; }

    if (isShift && key === 'MODE') { setIsMenuOpen(true); return; }

    if (key === 'AC' || key === 'ON') {
      setExpression(''); setResult(''); setIsShift(false); setIsAlpha(false); setHypMode(false); return;
    }

    if (key === 'DEL') { setExpression(prev => prev.slice(0, -1)); return; }

    if (key === 'ENG') {
        setSciMode(!sciMode);
        if (expression) { const res = safeEval(expression); setResult(res); }
        return;
    }

    if (key === 'STO') {
        if (result && result !== 'Math Error' && result !== 'Syntax Error') { setMemory(result); setIsShift(false); }
        return;
    }
    
    if (key === '=') {
      if (!expression) return;
      const res = safeEval(expression);
      setResult(res);
      if (res !== 'Syntax Error' && res !== 'Math Error' && typeof res !== 'string') { setPrevAns(res); }
      setIsShift(false); setIsAlpha(false); setHypMode(false);
      return;
    }

    let valToAdd = key;

    if (isShift) {
      switch (key) {
        case 'sin': valToAdd = 'sin⁻¹('; break;
        case 'cos': valToAdd = 'cos⁻¹('; break;
        case 'tan': valToAdd = 'tan⁻¹('; break;
        case 'log': valToAdd = '10^'; break;
        case 'ln': valToAdd = 'e^'; break;
        case 'x²': valToAdd = '√('; break;
        case 'x^': valToAdd = '∛('; break;
        case '.': valToAdd = 'Ran#'; break;
        case '×': valToAdd = 'P'; break; 
        case '÷': valToAdd = 'C'; break; 
        case '+': valToAdd = 'Pol('; break;
        case '-': valToAdd = 'Rec('; break;
        case 'x⁻¹': valToAdd = '!'; break;
      }
      setIsShift(false);
    } 
    else if (isAlpha) {
        if (key === ')') valToAdd = 'X';
        if (key === 'M+') valToAdd = 'M'; 
        setIsAlpha(false);
    }
    else {
      if (hypMode) {
          if (['sin','cos','tan'].includes(key)) { valToAdd = key + 'h('; }
          setHypMode(false);
      } else {
          if (['sin', 'cos', 'tan', 'log', 'ln', '√'].includes(key)) { valToAdd = key + '('; }
          if (key === 'x²') valToAdd = '^2';
          if (key === 'x^') valToAdd = '^';
          if (key === 'x⁻¹') valToAdd = '^-1';
          if (key === 'M+') {
              if (result && result !== 'Syntax Error') {
                  const newM = parseFloat(memory) + parseFloat(result);
                  setMemory(newM.toString());
                  return; 
              }
          }
      }
    }
    setExpression(prev => prev + valToAdd);
  };

  const CalcBtn = ({ label, shiftLabel, alphaLabel, type = 'num', onClick }: { label: any, shiftLabel?: string, alphaLabel?: string, type?: string, onClick: () => void }) => {
    let bg = "bg-[#333538] text-white shadow-[0_2px_0_#1a1a1a]"; 
    if (type === 'num') bg = "bg-[#e0e0e0] text-black shadow-[0_2px_0_#999]"; 
    if (type === 'action') bg = "bg-[#ef4444] text-white shadow-[0_2px_0_#b91c1c]"; 
    if (label === 'AC' || label === 'DEL') bg = "bg-[#d97706] text-white shadow-[0_2px_0_#92400e]"; 
    const isSmall = type === 'modifier' || type === 'func';

    return (
      <div className={`flex flex-col items-center justify-end`}>
        <div className="flex justify-between w-full px-0.5 text-[7px] font-bold h-3 overflow-hidden whitespace-nowrap">
          <span className="text-[#d4af37]">{shiftLabel}</span>
          <span className="text-[#ef4444]">{alphaLabel}</span>
        </div>
        <button 
          onClick={onClick}
          className={`w-full ${isSmall ? 'h-8 md:h-10 text-xs md:text-sm' : 'h-10 md:h-12 text-sm md:text-lg'} rounded-[4px] font-bold flex items-center justify-center transition-all active:translate-y-[2px] active:shadow-none ${bg} ${(label === 'SHIFT' && isShift) ? 'bg-[#d4af37] text-black' : ''} ${(label === 'ALPHA' && isAlpha) ? 'bg-[#ef4444] text-white' : ''}`}
        >
          {label}
        </button>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#e0e0e0] font-sans flex flex-col items-center justify-center p-2 md:p-4">
      <button onClick={() => navigate('/')} className="absolute top-4 left-4 z-20 w-10 h-10 bg-black/80 text-white rounded-full flex items-center justify-center shadow-lg"><i className="fas fa-arrow-left"></i></button>
      <div className="w-full max-w-[400px] bg-[#222] rounded-[10px] p-4 shadow-[0_10px_30px_rgba(0,0,0,0.5)] border border-[#111] relative overflow-hidden">
        <div className="flex justify-between items-center mb-3 px-1">
            <div className="text-gray-400 font-bold text-xs tracking-widest italic">CASIO <span className="text-white not-italic font-normal">LP-F4 v1.0</span></div>
            <div className="flex gap-2"><div className="h-3 w-12 bg-[#333] border border-[#444] rounded shadow-inner"></div></div>
        </div>
        <div className="bg-[#9ca] p-2 rounded-sm shadow-[inset_0_2px_5px_rgba(0,0,0,0.3)] border-4 border-[#333] mb-4 min-h-[90px] relative font-mono text-black">
            <div className="flex gap-2 text-[8px] font-bold border-b border-black/10 pb-0.5 mb-1 h-3.5">
                <span className={isShift ? 'visible' : 'invisible'}>S</span>
                <span className={isAlpha ? 'visible' : 'invisible'}>A</span>
                <span className={angleMode === 'DEG' ? 'visible' : 'invisible'}>D</span>
                <span className={angleMode === 'RAD' ? 'visible' : 'invisible'}>R</span>
                <span className={hypMode ? 'visible' : 'invisible'}>HYP</span>
                <span className={sciMode ? 'visible' : 'invisible'}>SCI</span>
                <span className="ml-auto">M</span>
            </div>
            {isMenuOpen && <div className="absolute inset-0 bg-[#9ca] z-20 p-2 flex flex-col text-[10px] font-bold space-y-1"><div className="w-full bg-black text-[#9ca] px-1 mb-1">SETUP MODE</div><div>1: Deg (Degrees)</div><div>2: Rad (Radians)</div><div>[AC] : Cancel</div></div>}
            <div className="text-right text-sm md:text-base break-all h-6 overflow-hidden whitespace-nowrap font-mono tracking-tighter">{expression}{cursorBlink ? '▌' : ''}</div>
            <div className="text-right text-2xl md:text-3xl font-bold tracking-tight mt-1 h-8 overflow-hidden">{result}</div>
        </div>
        <div className="grid grid-cols-5 gap-x-1.5 gap-y-2">
            <CalcBtn label="SHIFT" type="modifier" onClick={() => handlePress('SHIFT', 'menu')} />
            <CalcBtn label="ALPHA" type="modifier" onClick={() => handlePress('ALPHA', 'menu')} />
            <CalcBtn label={<i className="fas fa-arrow-up"></i>} type="func" onClick={() => {}} /> 
            <CalcBtn label="MODE" shiftLabel="SETUP" type="func" onClick={() => handlePress('MODE', 'menu')} />
            <CalcBtn label="ON" type="action" onClick={() => handlePress('ON', 'action')} />
            <CalcBtn label="x⁻¹" shiftLabel="x!" onClick={() => handlePress('x⁻¹', 'func')} />
            <CalcBtn label="nCr" shiftLabel="nPr" onClick={() => handlePress(isShift ? '×' : '÷', 'op')} /> 
            <CalcBtn label="Pol" shiftLabel="Rec" onClick={() => handlePress(isShift ? '-' : '+', 'func')} /> 
            <CalcBtn label="x³" shiftLabel="x¹/³" onClick={() => handlePress('^3', 'func')} />
            <CalcBtn label="x²" shiftLabel="√" onClick={() => handlePress('x²', 'func')} />
            <CalcBtn label="xⁿ" shiftLabel="ⁿ√" onClick={() => handlePress('x^', 'func')} />
            <CalcBtn label="log" shiftLabel="10ⁿ" onClick={() => handlePress('log', 'func')} />
            <CalcBtn label="ln" shiftLabel="eⁿ" onClick={() => handlePress('ln', 'func')} />
            <CalcBtn label="(-)" shiftLabel="A" onClick={() => handlePress('-', 'num')} />
            <CalcBtn label="hyp" shiftLabel="abs" onClick={() => handlePress('hyp', 'func')} />
            <CalcBtn label="STO" shiftLabel="RCL" onClick={() => handlePress('STO', 'func')} />
            <CalcBtn label="sin" shiftLabel="sin⁻¹" alphaLabel="D" onClick={() => handlePress('sin', 'func')} />
            <CalcBtn label="cos" shiftLabel="cos⁻¹" alphaLabel="E" onClick={() => handlePress('cos', 'func')} />
            <CalcBtn label="tan" shiftLabel="tan⁻¹" alphaLabel="F" onClick={() => handlePress('tan', 'func')} />
            <CalcBtn label="S⇔D" onClick={() => {}} />
            <CalcBtn label="(" onClick={() => handlePress('(', 'num')} />
            <CalcBtn label=")" alphaLabel="X" onClick={() => handlePress(')', 'num')} />
            <CalcBtn label="," alphaLabel="Y" onClick={() => handlePress(',', 'num')} />
            <CalcBtn label="M+" alphaLabel="M" onClick={() => handlePress('M+', 'func')} />
            <CalcBtn label="ENG" shiftLabel="←" onClick={() => handlePress('ENG', 'func')} />
            <CalcBtn label="7" onClick={() => handlePress('7', 'num')} />
            <CalcBtn label="8" onClick={() => handlePress('8', 'num')} />
            <CalcBtn label="9" onClick={() => handlePress('9', 'num')} />
            <CalcBtn label="DEL" shiftLabel="INS" type="action" onClick={() => handlePress('DEL', 'action')} />
            <CalcBtn label="AC" shiftLabel="OFF" type="action" onClick={() => handlePress('AC', 'action')} />
            <CalcBtn label="4" onClick={() => handlePress('4', 'num')} />
            <CalcBtn label="5" onClick={() => handlePress('5', 'num')} />
            <CalcBtn label="6" onClick={() => handlePress('6', 'num')} />
            <CalcBtn label="×" shiftLabel="P" onClick={() => handlePress('×', 'op')} />
            <CalcBtn label="÷" shiftLabel="C" onClick={() => handlePress('÷', 'op')} />
            <CalcBtn label="1" onClick={() => handlePress('1', 'num')} />
            <CalcBtn label="2" onClick={() => handlePress('2', 'num')} />
            <CalcBtn label="3" onClick={() => handlePress('3', 'num')} />
            <CalcBtn label="+" shiftLabel="Pol" onClick={() => handlePress('+', 'op')} />
            <CalcBtn label="-" shiftLabel="Rec" onClick={() => handlePress('-', 'op')} />
            <CalcBtn label="0" onClick={() => handlePress('0', 'num')} />
            <CalcBtn label="." shiftLabel="Ran#" onClick={() => handlePress('.', 'num')} />
            <CalcBtn label="×10ⁿ" shiftLabel="π" onClick={() => handlePress(isShift ? 'π' : '*10^', 'num')} />
            <CalcBtn label="Ans" shiftLabel="Pre" onClick={() => handlePress('Ans', 'num')} />
            <CalcBtn label="=" shiftLabel="%" onClick={() => handlePress('=', 'action')} />
        </div>
      </div>
    </div>
  );
};

export default CalculatorPage;
