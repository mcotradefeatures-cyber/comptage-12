import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User, HistoryEntry } from '../types';

interface DashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  history: HistoryEntry[];
  onLoadEntry: (entry: HistoryEntry) => void;
  onLogout: () => void;
  onPay: () => void;
  theme: 'color' | 'day' | 'night';
  currentSubPrice: number;
}

const DashboardModal: React.FC<DashboardModalProps> = ({ 
  isOpen, 
  onClose, 
  user, 
  history, 
  onLoadEntry, 
  onLogout, 
  onPay,
  theme,
  currentSubPrice
}) => {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Group history by date
  const historyByDate = useMemo(() => {
    const grouped: Record<string, HistoryEntry[]> = {};
    history.forEach(entry => {
      // entry.date is "DD/MM/YYYY"
      if (!grouped[entry.date]) grouped[entry.date] = [];
      grouped[entry.date].push(entry);
    });
    return grouped;
  }, [history]);

  if (!isOpen) return null;

  const subEnd = user.subscription_end || 0;

  // Calendar logic
  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const totalDays = daysInMonth(year, month);
  const startDay = firstDayOfMonth(year, month);

  const calendarDays = [];
  for (let i = 0; i < startDay; i++) calendarDays.push(null);
  for (let i = 1; i <= totalDays; i++) calendarDays.push(i);

  const formatMonth = (date: Date) => {
    return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(date);
  };

  const isDayWithHistory = (day: number) => {
    const dateStr = `${day.toString().padStart(2, '0')}/${(month + 1).toString().padStart(2, '0')}/${year}`;
    return !!historyByDate[dateStr];
  };

  const getEntriesForDay = (day: number) => {
    const dateStr = `${day.toString().padStart(2, '0')}/${(month + 1).toString().padStart(2, '0')}/${year}`;
    return historyByDate[dateStr] || [];
  };

  const bgClass = theme === 'night' ? 'bg-[#1a1a1a] text-white border-white/10' : 'bg-white text-black border-black/5';
  const cardClass = theme === 'night' ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-200';

  // Stats
  const totalCalculations = history.length;
  const last30DaysCount = history.filter(h => {
    const [d, m, y] = h.date.split('/').map(Number);
    const entryDate = new Date(y, m - 1, d);
    return (Date.now() - entryDate.getTime()) < (30 * 24 * 60 * 60 * 1000);
  }).length;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className={`w-full max-w-2xl p-5 sm:p-8 rounded-3xl shadow-2xl border my-auto relative ${bgClass}`}
      >
        <button onClick={onClose} className="absolute top-6 right-6 opacity-50 hover:opacity-100 transition-opacity font-bold text-2xl">
          ×
        </button>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
          {/* LEFT COLUMN: ACCOUNT & STATS */}
          <div className="space-y-6">
            <div className={`p-5 rounded-2xl border ${cardClass}`}>
              <div className="flex justify-between items-start">
                <div className="min-w-0 flex-1">
                  <div className="text-lg font-black uppercase tracking-tight text-blue-500 leading-none mb-1">
                    Compte Actif
                  </div>
                  <div className="text-[9px] font-bold opacity-60 uppercase truncate mb-2">{user.email.toLowerCase()}</div>
                  <div className="text-[10px] font-bold opacity-40 uppercase">Type: {user.account_type === 'team' ? 'Équipe (5)' : 'Personnel (1)'}</div>
                </div>
              </div>
            </div>

            <div className={`p-5 rounded-2xl border ${cardClass}`}>
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-[10px] font-black uppercase tracking-widest opacity-40">Abonnement</h3>
                <button 
                  onClick={onPay}
                  className="px-3 py-1 rounded-lg bg-blue-500/10 text-blue-500 font-black text-[8px] uppercase tracking-widest hover:bg-blue-500/20 transition-all"
                >
                  Paiement MVola
                </button>
              </div>
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <div>
                    <div className="text-[9px] font-bold uppercase opacity-50 mb-1">Temps restant</div>
                    <div className="text-2xl font-black leading-none">
                      {Math.max(0, Math.ceil((subEnd - Date.now()) / (1000 * 60 * 60 * 24)))} <span className="text-xs">Jours</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] font-bold uppercase opacity-50 mb-1">Date limite</div>
                    <div className="text-[11px] font-black">
                      {new Date(subEnd).toLocaleDateString('fr-FR')}
                    </div>
                    <div className="text-[9px] font-bold opacity-40">
                      à {new Date(subEnd).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
                
                <div className="w-full h-2 bg-black/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-green-500 transition-all duration-1000" 
                    style={{ 
                      width: `${Math.max(0, Math.min(100, ((subEnd - Date.now()) / (30 * 24 * 60 * 60 * 1000)) * 100))}%` 
                    }}
                  />
                </div>
              </div>
            </div>

            <button 
              onClick={onLogout}
              className="text-[9px] font-black uppercase tracking-[0.2em] opacity-20 hover:opacity-100 transition-opacity flex items-center gap-2 mt-2"
            >
              <i className="fa-solid fa-power-off text-[8px]"></i>
              Déconnexion Session
            </button>
          </div>

          {/* RIGHT COLUMN: CALENDAR & HISTORY */}
          <div className="space-y-6">
            <div className={`p-5 rounded-2xl border ${cardClass} relative overflow-hidden min-h-[340px]`}>
              <AnimatePresence mode="wait">
                {!selectedDate ? (
                  <motion.div
                    key="calendar"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="h-full"
                  >
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-[10px] font-black uppercase tracking-widest opacity-40">Calendrier d'activité</h3>
                      <div className="flex gap-2">
                        <button onClick={() => setCurrentMonth(new Date(year, month - 1))} className="p-1 opacity-50 hover:opacity-100"><i className="fa-solid fa-chevron-left text-xs"></i></button>
                        <button onClick={() => setCurrentMonth(new Date(year, month + 1))} className="p-1 opacity-50 hover:opacity-100"><i className="fa-solid fa-chevron-right text-xs"></i></button>
                      </div>
                    </div>
                    
                    <div className="text-center text-xs font-black uppercase mb-4 tracking-tighter">{formatMonth(currentMonth)}</div>

                    <div className="grid grid-cols-7 gap-1 text-center mb-2">
                      {['D', 'L', 'M1', 'M2', 'J', 'V', 'S'].map((d, i) => (
                        <div key={`${d}-${i}`} className="text-[8px] font-black opacity-30">{d.replace(/\d/, '')}</div>
                      ))}
                    </div>

                    <div className="grid grid-cols-7 gap-1">
                      {calendarDays.map((day, idx) => {
                        if (day === null) return <div key={`empty-${idx}`} />;
                        const hasHistory = isDayWithHistory(day);
                        const dateStr = `${day.toString().padStart(2, '0')}/${(month + 1).toString().padStart(2, '0')}/${year}`;
                        
                        return (
                          <button
                            key={day}
                            onClick={() => hasHistory && setSelectedDate(dateStr)}
                            className={`aspect-square rounded-lg flex flex-col items-center justify-center relative transition-all ${
                              hasHistory ? 'bg-green-500/10 text-green-600 hover:bg-green-500/20' : 'opacity-40 cursor-default'
                            }`}
                          >
                            <span className="text-[10px] font-black">{day}</span>
                            {hasHistory && (
                              <div className="w-1 h-1 bg-green-500 rounded-full absolute bottom-1" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                ) : (
                  <motion.div 
                    key="history"
                    initial={{ x: '-100%' }}
                    animate={{ x: 0 }}
                    exit={{ x: '-100%' }}
                    transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                    className={`absolute inset-0 p-5 ${bgClass} z-10 flex flex-col`}
                  >
                    <div className="flex justify-between items-center mb-4">
                      <button 
                        onClick={() => setSelectedDate(null)}
                        className="text-[10px] font-black uppercase tracking-widest opacity-40 hover:opacity-100 flex items-center gap-2"
                      >
                        <i className="fa-solid fa-arrow-left text-[8px]"></i>
                        Retour
                      </button>
                      <h3 className="text-[10px] font-black uppercase tracking-widest opacity-40">Calculs du {selectedDate}</h3>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                      {historyByDate[selectedDate]?.map(entry => (
                        <button
                          key={entry.id}
                          onClick={() => {
                            onLoadEntry(entry);
                            onClose();
                          }}
                          className={`w-full p-3 rounded-xl border text-left transition-all active:scale-[0.98] ${theme === 'night' ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-white border-gray-100 hover:border-blue-200'}`}
                        >
                          <div className="text-[10px] font-black uppercase truncate mb-1">{entry.title}</div>
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-black text-blue-500">{entry.total.toLocaleString()} Ar</span>
                            <span className="text-[8px] font-bold opacity-40">{entry.time}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default DashboardModal;
