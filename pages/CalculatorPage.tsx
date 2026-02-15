import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { playSound } from '../services/audioService';

type AngleMode = 'DEG' | 'RAD';

const CalculatorPage: React.FC = () => {
  const navigate = useNavigate();
  
  // Display State
  const [expression, setExpression] = useState('');
  const [result, setResult] = useState('');
  const [prevAns, setPrevAns] = useState('0');
  const [history, setHistory] = useState<string[]>([]);
  
  // Calculator State
  const [isShift, setIsShift] = useState(false);
  const [isAlpha, setIsAlpha] = useState(false);
  const [angleMode, setAngleMode] = useState<AngleMode>('DEG');
  const [isMenuOpen, setIsMenuOpen] = useState(false); // Setup Menu
  const [cursorBlink, setCursorBlink] = useState(true);

  // Blink cursor effect
  useEffect(() => {
    const interval = setInterval(() => setCursorBlink(b => !b), 500);
    return () => clearInterval(interval);
  }, []);

  const safeEval = (expr: string) => {
    try {
      // 1. Pre-process formatting
      let evalStr = expr
        .replace(/×/g, '*')
        .replace(/÷/g, '/')
        .replace(/π/g, 'Math.PI')
        .replace(/e/g, 'Math.E')
        .replace(/\^/g, '**')
        .replace(/Ans/g, prevAns);

      // 2. Handle Functions
      // Helper to wrap trig inputs for DEG conversion
      const toRad = (n: number) => angleMode === 'DEG' ? n * (Math.PI / 180) : n;
      const toDeg = (n: number) => angleMode === 'DEG' ? n * (180 / Math.PI) : n;

      // Define scope
      const scope = {
        sin: (x: number) => Math.sin(toRad(x)),
        cos: (x: number) => Math.cos(toRad(x)),
        tan: (x: number) => Math.tan(toRad(x)),
        asin: (x: number) => toDeg(Math.asin(x)),
        acos: (x: number) => toDeg(Math.acos(x)),
        atan: (x: number) => toDeg(Math.atan(x)),
        sqrt: Math.sqrt,
        cbrt: Math.cbrt,
        log: Math.log10,
        ln: Math.log,
        exp: Math.exp,
        pow: Math.pow,
        abs: Math.abs,
        fact: (n: number): number => n <= 1 ? 1 : n * scope.fact(n - 1)
      };

      // 3. Replace text representations with JS calls
      // Order matters: longer names first to avoid partial replacement
      evalStr = evalStr
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
        .replace(/!/g, '') // Factorial handling would require a parser, simplistic approach here fails for 5!. 
                           // For simple JS eval, factorial usually needs a function wrapper fact(5).
                           // Let's assume user enters fact(5) via button logic or we handle simple postfix ! roughly:
        .replace(/(\d+)!/g, 'scope.fact($1)'); 

      // eslint-disable-next-line no-new-func
      const func = new Function('scope', `with(scope) { return ${evalStr} }`);
      const res = func(scope);
      
      if (isNaN(res) || !isFinite(res)) return 'Math Error';
      
      // Formatting
      return parseFloat(res.toFixed(10)).toString(); // Clean up floating point precision
    } catch (e) {
      return 'Syntax Error';
    }
  };

  const handlePress = (key: string, type: 'num' | 'op' | 'func' | 'action' | 'menu') => {
    playSound('click');

    // --- MENU HANDLING ---
    if (isMenuOpen) {
      if (key === '1') { setAngleMode('DEG'); setIsMenuOpen(false); setIsShift(false); return; }
      if (key === '2') { setAngleMode('RAD'); setIsMenuOpen(false); setIsShift(false); return; }
      if (key === 'AC' || key === 'ON') { setIsMenuOpen(false); setIsShift(false); return; }
      return; // Ignore other keys in menu
    }

    // --- SHIFT/ALPHA MODIFIERS ---
    if (key === 'SHIFT') {
      setIsShift(!isShift);
      setIsAlpha(false);
      return;
    }
    if (key === 'ALPHA') {
      setIsAlpha(!isAlpha);
      setIsShift(false);
      return;
    }

    // --- SETUP MENU SHORTCUT ---
    if (isShift && key === 'MODE') {
      setIsMenuOpen(true);
      return;
    }

    // --- STANDARD ACTIONS ---
    if (key === 'AC' || key === 'ON') {
      setExpression('');
      setResult('');
      setIsShift(false);
      setIsAlpha(false);
      return;
    }

    if (key === 'DEL') {
      setExpression(prev => prev.slice(0, -1));
      return;
    }

    if (key === '=') {
      if (!expression) return;
      const res = safeEval(expression);
      setResult(res);
      if (res !== 'Syntax Error' && res !== 'Math Error') {
        setPrevAns(res);
        setHistory(prev => [expression + ' = ' + res, ...prev].slice(0, 5));
      }
      setIsShift(false); // Reset modifiers after calc
      return;
    }

    // --- INPUT HANDLING ---
    let valToAdd = key;

    // Handle Shifted Functions
    if (isShift) {
      switch (key) {
        case 'sin': valToAdd = 'sin⁻¹('; break;
        case 'cos': valToAdd = 'cos⁻¹('; break;
        case 'tan': valToAdd = 'tan⁻¹('; break;
        case 'log': valToAdd = '10^'; break;
        case 'ln': valToAdd = 'e^'; break;
        case 'x²': valToAdd = '√('; break; // Note: Button labels mapped differently in UI, logic here ensures correct insert
        case 'x^': valToAdd = '∛('; break;
        case '(': valToAdd = '%'; break; // Percentage? or keep simple
        case '.': valToAdd = 'Ran#'; break; // Random
        // Add more shift mappings
      }
      setIsShift(false); // Consume shift
    } else {
      // Standard Functions needing brackets
      if (['sin', 'cos', 'tan', 'log', 'ln', '√'].includes(key)) {
        valToAdd = key + '(';
      }
      if (key === 'x²') valToAdd = '^2';
      if (key === 'x^') valToAdd = '^';
    }

    setExpression(prev => prev + valToAdd);
  };

  // --- BUTTON COMPONENT ---
  const CalcBtn = ({ 
    label, 
    shiftLabel, 
    alphaLabel, 
    type = 'num', 
    span = 1,
    onClick 
  }: { 
    label: any, 
    shiftLabel?: string, 
    alphaLabel?: string, 
    type?: 'num' | 'op' | 'func' | 'action' | 'modifier', 
    span?: number,
    onClick: () => void 
  }) => {
    let bg = "bg-[#333538] text-white shadow-[0_3px_0_#222]"; // Standard
    if (type === 'num') bg = "bg-[#e5e7eb] text-black shadow-[0_3px_0_#9ca3af]"; // Numbers Light
    if (type === 'action') bg = "bg-[#ef4444] text-white shadow-[0_3px_0_#b91c1c]"; // AC/DEL
    if (type === 'modifier' && label === 'SHIFT') bg = "bg-[#ca8a04] text-white shadow-[0_3px_0_#a16207]";
    if (type === 'modifier' && label === 'ALPHA') bg = "bg-[#db2777] text-white shadow-[0_3px_0_#be185d]";
    
    // Check if active
    if (label === 'SHIFT' && isShift) bg = "bg-[#facc15] text-black shadow-none translate-y-[3px]";
    if (label === 'ALPHA' && isAlpha) bg = "bg-[#f472b6] text-black shadow-none translate-y-[3px]";

    return (
      <div className="flex flex-col items-center gap-1" style={{ gridColumn: span > 1 ? `span ${span}` : 'auto' }}>
        <div className="flex justify-between w-full px-1 text-[8px] font-bold h-3">
          <span className="text-yellow-500">{shiftLabel}</span>
          <span className="text-pink-500">{alphaLabel}</span>
        </div>
        <button 
          onClick={onClick}
          className={`w-full h-12 md:h-14 rounded-md font-bold text-lg md:text-xl flex items-center justify-center transition-all active:translate-y-[3px] active:shadow-none ${bg}`}
        >
          {label}
        </button>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#e0e0e0] font-sans flex flex-col items-center justify-center p-4">
      
      {/* Navbar Back Button (Absolute) */}
      <button onClick={() => navigate('/')} className="absolute top-4 left-4 z-20 w-10 h-10 bg-black/80 text-white rounded-full flex items-center justify-center shadow-lg">
        <i className="fas fa-arrow-left"></i>
      </button>

      {/* CALCULATOR BODY */}
      <div className="w-full max-w-sm bg-[#1a1b1e] rounded-[2rem] p-5 shadow-[0_20px_50px_rgba(0,0,0,0.5),inset_0_2px_5px_rgba(255,255,255,0.1)] border border-[#333] relative overflow-hidden">
        
        {/* BRANDING */}
        <div className="flex justify-between items-center mb-4 px-2">
            <div className="text-gray-400 font-bold text-xs tracking-widest italic">PRO-CALC <span className="text-yellow-500 not-italic">fx-991EX</span></div>
            <div className="h-2 w-16 bg-gradient-to-r from-gray-700 to-gray-800 rounded-full border border-gray-900 shadow-inner"></div> {/* Solar Panel Fake */}
        </div>

        {/* SCREEN */}
        <div className="bg-[#c2dcc0] p-4 rounded-lg shadow-[inset_0_4px_8px_rgba(0,0,0,0.2)] border-4 border-[#333] mb-6 min-h-[100px] relative font-mono text-slate-900">
            {/* Status Bar */}
            <div className="flex gap-3 text-[10px] font-bold border-b border-slate-900/10 pb-1 mb-1 h-5">
                <span className={isShift ? 'bg-black text-white px-1' : 'opacity-20'}>S</span>
                <span className={isAlpha ? 'bg-black text-white px-1' : 'opacity-20'}>A</span>
                <span className={angleMode === 'DEG' ? 'bg-black text-white px-1' : 'opacity-20'}>D</span>
                <span className={angleMode === 'RAD' ? 'bg-black text-white px-1' : 'opacity-20'}>R</span>
                <span className="opacity-20">FIX</span>
            </div>

            {/* Menu Overlay */}
            {isMenuOpen && (
                <div className="absolute inset-0 bg-[#c2dcc0] z-10 p-2 flex flex-col justify-center items-start text-xs font-bold space-y-1">
                    <div className="w-full bg-black text-[#c2dcc0] px-1 mb-1">SETUP</div>
                    <div>1: Deg (Degrees)</div>
                    <div>2: Rad (Radians)</div>
                    <div>[AC] : Cancel</div>
                </div>
            )}

            {/* Expression Line */}
            <div className="text-right text-lg break-all h-8 overflow-hidden whitespace-nowrap">
               {expression}{cursorBlink ? '▌' : ''}
            </div>

            {/* Result Line */}
            <div className="text-right text-3xl font-black tracking-tight mt-1 h-10 overflow-hidden text-black">
                {result}
            </div>
        </div>

        {/* KEYPAD */}
        <div className="grid grid-cols-5 gap-x-2 gap-y-3">
            
            {/* ROW 1: Controls */}
            <CalcBtn label="SHIFT" type="modifier" onClick={() => handlePress('SHIFT', 'menu')} />
            <CalcBtn label="ALPHA" type="modifier" onClick={() => handlePress('ALPHA', 'menu')} />
            <CalcBtn label={<i className="fas fa-chevron-left"></i>} type="func" onClick={() => {}} /> 
            <CalcBtn label={<i className="fas fa-chevron-right"></i>} type="func" onClick={() => {}} /> 
            <CalcBtn label="MODE" shiftLabel="SETUP" onClick={() => handlePress('MODE', 'menu')} />

            {/* ROW 2: Scientific 1 */}
            <CalcBtn label="x⁻¹" shiftLabel="!" onClick={() => handlePress('^-1', 'func')} />
            <CalcBtn label="x²" shiftLabel="√" onClick={() => handlePress('x²', 'func')} />
            <CalcBtn label="xⁿ" shiftLabel="∛" onClick={() => handlePress('x^', 'func')} />
            <CalcBtn label="log" shiftLabel="10ⁿ" onClick={() => handlePress('log', 'func')} />
            <CalcBtn label="ln" shiftLabel="eⁿ" onClick={() => handlePress('ln', 'func')} />

            {/* ROW 3: Trig */}
            <CalcBtn label="(-)" shiftLabel="A" onClick={() => handlePress('-', 'num')} />
            <CalcBtn label="hyp" shiftLabel="B" onClick={() => {}} />
            <CalcBtn label="sin" shiftLabel="sin⁻¹" onClick={() => handlePress('sin', 'func')} />
            <CalcBtn label="cos" shiftLabel="cos⁻¹" onClick={() => handlePress('cos', 'func')} />
            <CalcBtn label="tan" shiftLabel="tan⁻¹" onClick={() => handlePress('tan', 'func')} />

            {/* ROW 4: Memory/Parens */}
            <CalcBtn label="RCL" shiftLabel="STO" onClick={() => {}} />
            <CalcBtn label="ENG" shiftLabel="←" onClick={() => {}} />
            <CalcBtn label="(" onClick={() => handlePress('(', 'num')} />
            <CalcBtn label=")" onClick={() => handlePress(')', 'num')} />
            <CalcBtn label="S⇔D" onClick={() => {}} />

            {/* ROW 5: Numbers / DEL / AC */}
            <CalcBtn label="7" onClick={() => handlePress('7', 'num')} />
            <CalcBtn label="8" onClick={() => handlePress('8', 'num')} />
            <CalcBtn label="9" onClick={() => handlePress('9', 'num')} />
            <CalcBtn label="DEL" shiftLabel="INS" type="action" onClick={() => handlePress('DEL', 'action')} />
            <CalcBtn label="AC" shiftLabel="OFF" type="action" onClick={() => handlePress('AC', 'action')} />

            {/* ROW 6: Numbers / Ops */}
            <CalcBtn label="4" onClick={() => handlePress('4', 'num')} />
            <CalcBtn label="5" onClick={() => handlePress('5', 'num')} />
            <CalcBtn label="6" onClick={() => handlePress('6', 'num')} />
            <CalcBtn label="×" shiftLabel="nPr" onClick={() => handlePress('×', 'op')} />
            <CalcBtn label="÷" shiftLabel="nCr" onClick={() => handlePress('÷', 'op')} />

            {/* ROW 7: Numbers / Ops */}
            <CalcBtn label="1" onClick={() => handlePress('1', 'num')} />
            <CalcBtn label="2" onClick={() => handlePress('2', 'num')} />
            <CalcBtn label="3" onClick={() => handlePress('3', 'num')} />
            <CalcBtn label="+" shiftLabel="Pol" onClick={() => handlePress('+', 'op')} />
            <CalcBtn label="-" shiftLabel="Rec" onClick={() => handlePress('-', 'op')} />

            {/* ROW 8: Bottom */}
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