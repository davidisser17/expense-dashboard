import React, { useState, useEffect } from 'react';
import { Plus, ArrowLeft, Download, Upload, Trash2, Calendar, DollarSign, Edit2, Check, X, LogOut, Eye, EyeOff } from 'lucide-react';
import { auth, db } from './firebase';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { collection, doc, setDoc, getDoc, getDocs, deleteDoc } from 'firebase/firestore';

const ExpenseDashboard = () => {
  // Auth state
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // App states
  const [view, setView] = useState('list');
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [expenses, setExpenses] = useState({});
  const [newExpense, setNewExpense] = useState({ date: '', description: '', category: 'Ngopi', amount: '' });
  const [filters, setFilters] = useState({ date: '', category: 'Semua' });
  const [showStickyFilter, setShowStickyFilter] = useState(false);
  const [showMonthModal, setShowMonthModal] = useState(false);
  const [newMonthData, setNewMonthData] = useState({ month: new Date().getMonth() + 1, year: new Date().getFullYear() });
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({ date: '', description: '', category: '', amount: '' });
  const categories = ['Ngopi', 'Makan', 'Nongkrong', 'Tak Terduga'];

  // Check auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
      if (currentUser) {
        loadData(currentUser.uid);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setShowStickyFilter(window.scrollY > 100);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError('');

    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      console.error('Login error:', error);
      setAuthError('Email atau password salah!');
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setExpenses({});
      setEmail('');
      setPassword('');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const loadData = async (userId) => {
    try {
      const expensesRef = collection(db, `users/${userId}/expenses`);
      const snapshot = await getDocs(expensesRef);
      
      const loadedExpenses = {};
      snapshot.forEach((doc) => {
        loadedExpenses[doc.id] = doc.data();
      });
      
      setExpenses(loadedExpenses);
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const saveData = async (key, data) => {
    try {
      if (!user) return;
      const docRef = doc(db, `users/${user.uid}/expenses`, key);
      await setDoc(docRef, data);
      
      // Update local state
      setExpenses(prev => ({ ...prev, [key]: data }));
    } catch (error) {
      console.error('Error saving data:', error);
      alert('Gagal menyimpan data. Coba lagi.');
    }
  };

  const generateMonthKey = (month, year) => `${year}-${String(month).padStart(2, '0')}`;

  const createNewMonth = () => {
    const monthKey = generateMonthKey(newMonthData.month, newMonthData.year);
    
    if (expenses[monthKey]) {
      alert('Bulan ini sudah ada! Silakan pilih bulan lain.');
      return;
    }
    
    const monthDataObj = {
      month: newMonthData.month,
      year: newMonthData.year,
      items: []
    };
    
    saveData(monthKey, monthDataObj);
    setShowMonthModal(false);
    setSelectedMonth(monthKey);
    setView('detail');
  };

  const addExpense = () => {
    if (!newExpense.date || !newExpense.description || !newExpense.category || !newExpense.amount) {
      alert('Semua field harus diisi!');
      return;
    }

    const monthData = expenses[selectedMonth];
    const updatedItems = [...monthData.items, {
      id: Date.now(),
      date: newExpense.date,
      description: newExpense.description,
      category: newExpense.category,
      amount: parseFloat(newExpense.amount)
    }];

    const updatedMonthData = { ...monthData, items: updatedItems };
    saveData(selectedMonth, updatedMonthData);
    setNewExpense({ date: '', description: '', category: 'Ngopi', amount: '' });
  };

  const deleteExpense = (id) => {
    const monthData = expenses[selectedMonth];
    const updatedItems = monthData.items.filter(item => item.id !== id);
    const updatedMonthData = { ...monthData, items: updatedItems };
    saveData(selectedMonth, updatedMonthData);
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditData({
      date: item.date,
      description: item.description,
      category: item.category,
      amount: item.amount
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData({ date: '', description: '', category: '', amount: '' });
  };

  const saveEdit = () => {
    if (!editData.date || !editData.description || !editData.category || !editData.amount) {
      alert('Semua field harus diisi!');
      return;
    }

    const monthData = expenses[selectedMonth];
    const updatedItems = monthData.items.map(item => 
      item.id === editingId 
        ? { ...item, ...editData, amount: parseFloat(editData.amount) }
        : item
    );
    
    const updatedMonthData = { ...monthData, items: updatedItems };
    saveData(selectedMonth, updatedMonthData);
    cancelEdit();
  };

  const calculateTotal = (monthKey) => {
    const monthData = expenses[monthKey];
    return monthData?.items.reduce((sum, item) => sum + item.amount, 0) || 0;
  };

  const calculateCategoryTotal = (monthKey, category) => {
    const monthData = expenses[monthKey];
    return monthData?.items
      .filter(item => item.category === category)
      .reduce((sum, item) => sum + item.amount, 0) || 0;
  };

  const getFilteredItems = (items) => {
    return items.filter(item => {
      const matchDate = !filters.date || item.date === filters.date;
      const matchCategory = filters.category === 'Semua' || item.category === filters.category;
      return matchDate && matchCategory;
    });
  };

  const exportToCSV = (monthKey = null) => {
    let csvContent = 'Tanggal,Pengeluaran,Kategori,Jumlah\n';
    
    if (monthKey) {
      const monthData = expenses[monthKey];
      if (monthData && monthData.items) {
        monthData.items.forEach(item => {
          csvContent += `${item.date},"${item.description.replace(/"/g, '""')}",${item.category},${item.amount}\n`;
        });
      }
    } else {
      Object.keys(expenses).sort().reverse().forEach(key => {
        const monthData = expenses[key];
        csvContent += `\n${getMonthName(monthData.month)} ${monthData.year}\n`;
        csvContent += `Tanggal,Pengeluaran,Kategori,Jumlah\n`;
        if (monthData && monthData.items) {
          monthData.items.forEach(item => {
            csvContent += `${item.date},"${item.description.replace(/"/g, '""')}",${item.category},${item.amount}\n`;
          });
        }
      });
    }

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', monthKey ? `pengeluaran-${monthKey}.csv` : 'pengeluaran-semua.csv');
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
  };

  const importFromFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onerror = (error) => {
      console.error('FileReader error:', error);
      alert('❌ Error membaca file');
    };
    
    reader.onload = async (event) => {
      try {
        const text = event.target.result;
        const lines = text.split('\n').filter(line => line.trim() && !line.toLowerCase().startsWith('tanggal'));
        
        const monthData = expenses[selectedMonth];
        const newItems = [];

        for (let i = 0; i < lines.length; i++) {
          let line = lines[i].trim();
          
          if (line.startsWith('"') && line.endsWith('"')) {
            line = line.substring(1, line.length - 1);
          }
          
          line = line.replace(/\\"/g, '"');
          const parts = line.split(',');

          if (parts && parts.length >= 4) {
            let date = parts[0].trim();
            const description = parts[1].trim();
            const category = parts[2].trim();
            let amountStr = parts.slice(3).join(',').trim();
            
            amountStr = amountStr.replace(/["\\]/g, '');
            amountStr = amountStr.replace(/IDR\s*/gi, '');
            amountStr = amountStr.replace(/\s/g, '');
            
            if (amountStr.includes('.') && amountStr.includes(',')) {
              amountStr = amountStr.replace(/\./g, '').replace(',', '.');
            } else if (amountStr.includes(',') && amountStr.lastIndexOf(',') > amountStr.length - 4) {
              amountStr = amountStr.replace(/\./g, '').replace(',', '.');
            } else {
              amountStr = amountStr.replace(/[,.]/g, '');
            }
            
            const amount = parseFloat(amountStr);
            
            if (date.includes('/')) {
              const dateParts = date.split('/');
              if (dateParts.length === 3) {
                const month = dateParts[0].padStart(2, '0');
                const day = dateParts[1].padStart(2, '0');
                const year = dateParts[2];
                date = `${year}-${month}-${day}`;
              }
            }

            if (date && description && category && !isNaN(amount)) {
              newItems.push({
                id: Date.now() + i + Math.random(),
                date: date,
                description: description,
                category: category,
                amount: amount
              });
            }
          }
        }

        if (newItems.length > 0) {
          const updatedItems = [...monthData.items, ...newItems];
          const updatedMonthData = { ...monthData, items: updatedItems };
          await saveData(selectedMonth, updatedMonthData);
          alert(`✅ ${newItems.length} data berhasil diimport!`);
        } else {
          alert('❌ Tidak ada data valid yang ditemukan.');
        }
      } catch (error) {
        console.error('Import error:', error);
        alert('❌ Gagal import file.');
      }
    };

    reader.readAsText(file);
    e.target.value = '';
  };

  const getMonthName = (month) => {
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 
                    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    return months[month - 1];
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(amount);
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  // Login Page
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800 rounded-2xl p-8 max-w-md w-full border border-slate-700 shadow-2xl">
          <div className="text-center mb-8">
            <div className="inline-block p-4 bg-blue-500/10 rounded-2xl mb-4">
              <DollarSign className="text-blue-400" size={48} />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Dashboard Pengeluaran</h1>
            <p className="text-slate-400">Kelola keuangan Anda dengan mudah</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-slate-400 mb-2 text-sm">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-slate-700 text-white rounded-xl border border-slate-600 focus:border-blue-500 focus:outline-none transition-all"
                placeholder="Masukkan Email Anda"
                required
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-2 text-sm">Password</label>

              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 pr-12 bg-slate-700 text-white rounded-xl border border-slate-600 focus:border-blue-500 focus:outline-none transition-all"
                  placeholder="Masukkan password"
                  required
                />

                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-all"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {authError && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                <p className="text-red-400 text-sm">{authError}</p>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all font-semibold shadow-lg"
            >
              Login
            </button>
          </form>

          {/* <div className="mt-6 p-4 bg-slate-700/50 rounded-xl">
            <p className="text-slate-400 text-xs text-center mb-2">Account Info:</p>
            <p className="text-slate-300 text-sm text-center font-mono">admin@expense.app</p>
            <p className="text-slate-300 text-sm text-center font-mono">admin1705</p>
          </div> */}
        </div>
      </div>
    );
  }

  // Main App - Listing Page
  if (view === 'list') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-4xl font-bold text-white mb-2">Dashboard Pengeluaran</h1>
              <p className="text-slate-400">Kelola pengeluaran bulanan Anda</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-6 py-3 bg-slate-700 text-white rounded-xl hover:bg-slate-600 transition-all shadow-lg hover:shadow-xl"
              >
                <LogOut size={20} />
                Logout
              </button>
              <button
                onClick={() => exportToCSV()}
                className="flex items-center gap-2 px-6 py-3 bg-slate-700 text-white rounded-xl hover:bg-slate-600 transition-all shadow-lg hover:shadow-xl"
              >
                <Download size={20} />
                Export All
              </button>
              <button
                onClick={() => setShowMonthModal(true)}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg hover:shadow-xl"
              >
                <Plus size={20} />
                Bulan Baru
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Object.keys(expenses)
            .sort((a, b) => {
              const dataA = expenses[a];
              const dataB = expenses[b];

              // Urutkan tahun dulu
              if (dataA.year !== dataB.year) {
                return dataB.year - dataA.year;
              }

              // Baru urutkan bulan
              return dataA.month - dataB.month;
            })
            .map(key => {
              const monthData = expenses[key];
              const total = calculateTotal(key);
              
              return (
                <div
                  key={key}
                  onClick={() => {
                    setSelectedMonth(key);
                    setView('detail');
                  }}
                  className="bg-slate-800 rounded-2xl p-6 cursor-pointer hover:bg-slate-750 transition-all border border-slate-700 hover:border-blue-500 hover:shadow-xl hover:shadow-blue-500/10 group"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-3 bg-blue-500/10 rounded-xl group-hover:bg-blue-500/20 transition-all">
                      <Calendar className="text-blue-400" size={24} />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">
                        {getMonthName(monthData.month)} {monthData.year}
                      </h3>
                      <p className="text-sm text-slate-400">{monthData.items.length} transaksi</p>
                    </div>
                  </div>
                  
                  <div className="pt-4 border-t border-slate-700">
                    <p className="text-sm text-slate-400 mb-1">Total Pengeluaran</p>
                    <p className="text-2xl font-bold text-blue-400">{formatCurrency(total)}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {Object.keys(expenses).length === 0 && (
            <div className="text-center py-20">
              <div className="inline-block p-6 bg-slate-800 rounded-full mb-4">
                <DollarSign className="text-slate-600" size={48} />
              </div>
              <p className="text-slate-400 text-lg">Belum ada data pengeluaran</p>
              <p className="text-slate-500 text-sm mt-2">Klik "Bulan Baru" untuk memulai</p>
            </div>
          )}
        </div>

        {/* Modal Bulan Baru */}
        {showMonthModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-slate-800 rounded-2xl p-8 max-w-md w-full mx-4 border border-slate-700 shadow-2xl">
              <h2 className="text-2xl font-bold text-white mb-6">Pilih Bulan & Tahun</h2>
              
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-slate-400 mb-2 text-sm">Bulan</label>
                  <select
                    value={newMonthData.month}
                    onChange={(e) => setNewMonthData({ ...newMonthData, month: parseInt(e.target.value) })}
                    className="w-full px-4 py-3 bg-slate-700 text-white rounded-xl border border-slate-600 focus:border-blue-500 focus:outline-none transition-all"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                      <option key={m} value={m}>{getMonthName(m)}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-2 text-sm">Tahun</label>
                  <input
                    type="number"
                    value={newMonthData.year}
                    onChange={(e) => setNewMonthData({ ...newMonthData, year: parseInt(e.target.value) })}
                    className="w-full px-4 py-3 bg-slate-700 text-white rounded-xl border border-slate-600 focus:border-blue-500 focus:outline-none transition-all"
                    min="2020"
                    max="2099"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowMonthModal(false)}
                  className="flex-1 px-6 py-3 bg-slate-700 text-white rounded-xl hover:bg-slate-600 transition-all"
                >
                  Batal
                </button>
                <button
                  onClick={createNewMonth}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all font-semibold"
                >
                  Buat
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Detail Page
// Detail Page
const currentMonthData = expenses[selectedMonth];

if (!currentMonthData) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
      <div className="text-center">
        <p className="text-white text-2xl font-bold mb-2">
          Data bulan tidak ditemukan
        </p>

        <button
          onClick={() => setView('list')}
          className="mt-4 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all"
        >
          Kembali
        </button>
      </div>
    </div>
  );
}

const total = calculateTotal(selectedMonth);

return (

    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
      {/* Sticky Filter */}
      {showStickyFilter && (
        <div className="fixed top-0 left-0 right-0 bg-slate-900/95 backdrop-blur-md border-b border-slate-700 shadow-2xl z-50 px-8 py-4">
          <div className="max-w-6xl mx-auto flex items-center gap-4">
            <button
              onClick={() => setView('list')}
              className="p-2.5 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-all border border-slate-700"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-white">
                {getMonthName(currentMonthData.month)} {currentMonthData.year}
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="date"
                value={filters.date}
                onChange={(e) => setFilters({ ...filters, date: e.target.value })}
                className="px-3 py-2 bg-slate-800 text-white text-sm rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none transition-all"
              />
              <select
                value={filters.category}
                onChange={(e) => setFilters({ ...filters, category: e.target.value })}
                className="px-3 py-2 bg-slate-800 text-white text-sm rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none transition-all appearance-none cursor-pointer"
              >
                <option value="Semua">Semua Kategori</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <button
                onClick={() => setFilters({ date: '', category: 'Semua' })}
                className="px-4 py-2 text-sm bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-all whitespace-nowrap"
              >
                Reset
              </button>
              <button
                onClick={() => exportToCSV(selectedMonth)}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-all text-sm"
              >
                <Download size={18} />
                Export
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto">
        {/* Header Original */}
        {!showStickyFilter && (
          <div className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setView('list')}
                className="p-3 bg-slate-800 text-white rounded-xl hover:bg-slate-700 transition-all border border-slate-700"
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <h1 className="text-4xl font-bold text-white">
                  {getMonthName(currentMonthData.month)} {currentMonthData.year}
                </h1>
                <p className="text-slate-400 mt-1">Detail Pengeluaran</p>
              </div>
            </div>
            <button
              onClick={() => exportToCSV(selectedMonth)}
              className="flex items-center gap-2 px-6 py-3 bg-slate-700 text-white rounded-xl hover:bg-slate-600 transition-all shadow-lg"
            >
              <Download size={20} />
              Export CSV
            </button>
          </div>
        )}
        
        {showStickyFilter && <div className="h-[88px] mb-8"></div>}

        {/* Total Pengeluaran */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-8 mb-8 shadow-xl">
          <p className="text-blue-100 text-sm mb-2">Total Pengeluaran Bulan Ini</p>
          <p className="text-5xl font-bold text-white">{formatCurrency(total)}</p>
          <p className="text-blue-100 text-sm mt-3">{currentMonthData.items.length} transaksi tercatat</p>
        </div>

        {/* Breakdown Kategori */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          {categories.map(category => {
            const categoryTotal = calculateCategoryTotal(selectedMonth, category);
            const percentage = total > 0 ? ((categoryTotal / total) * 100).toFixed(1) : 0;
            return (
              <div key={category} className="bg-slate-800 rounded-xl p-5 border border-slate-700">
                <p className="text-slate-400 text-sm mb-2">{category}</p>
                <p className="text-2xl font-bold text-white mb-1">{formatCurrency(categoryTotal)}</p>
                <p className="text-slate-500 text-xs">{percentage}% dari total</p>
              </div>
            );
          })}
        </div>

        {/* Form Tambah Pengeluaran */}
        <div className="bg-slate-800 rounded-2xl p-6 mb-6 border border-slate-700">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold text-white">Tambah Pengeluaran Baru</h3>
            <label className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-xl hover:bg-slate-600 transition-all cursor-pointer">
              <Upload size={18} />
              Import CSV
              <input type="file" accept=".csv" onChange={importFromFile} className="hidden" />
            </label>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <input
              type="date"
              value={newExpense.date}
              onChange={(e) => setNewExpense({ ...newExpense, date: e.target.value })}
              className="px-4 py-3 bg-slate-700 text-white rounded-xl border border-slate-600 focus:border-blue-500 focus:outline-none transition-all"
            />
            <input
              type="text"
              placeholder="Pengeluaran"
              value={newExpense.description}
              onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
              className="px-4 py-3 bg-slate-700 text-white rounded-xl border border-slate-600 focus:border-blue-500 focus:outline-none transition-all placeholder-slate-400"
            />
            <select
              value={newExpense.category}
              onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })}
              className="px-4 py-3 bg-slate-700 text-white rounded-xl border border-slate-600 focus:border-blue-500 focus:outline-none transition-all appearance-none cursor-pointer"
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <input
              type="number"
              placeholder="Jumlah"
              value={newExpense.amount}
              onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
              className="px-4 py-3 bg-slate-700 text-white rounded-xl border border-slate-600 focus:border-blue-500 focus:outline-none transition-all placeholder-slate-400"
            />
            <button
              onClick={addExpense}
              className="px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all font-semibold shadow-lg"
            >
              Tambah
            </button>
          </div>
        </div>

        {/* Tabel Pengeluaran */}
        <div className="bg-slate-800 rounded-2xl overflow-hidden border border-slate-700">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-750 border-b border-slate-700">
                  <th className="text-left px-6 py-4 text-slate-300 font-semibold">Tanggal</th>
                  <th className="text-left px-6 py-4 text-slate-300 font-semibold">Pengeluaran</th>
                  <th className="text-left px-6 py-4 text-slate-300 font-semibold">Kategori</th>
                  <th className="text-right px-6 py-4 text-slate-300 font-semibold">Jumlah</th>
                  <th className="text-center px-6 py-4 text-slate-300 font-semibold">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {
                  getFilteredItems(
                    [...currentMonthData.items].sort(
                      (a, b) => new Date(b.date) - new Date(a.date)
                    )
                  ).map((item, index) => (
                  <tr 
                    key={item.id}
                    className={`border-b border-slate-700 hover:bg-slate-750 transition-all ${
                      index % 2 === 0 ? 'bg-slate-800' : 'bg-slate-800/50'
                    }`}
                  >
                    {editingId === item.id ? (
                      <>
                        <td className="px-6 py-4">
                          <input
                            type="date"
                            value={editData.date}
                            onChange={(e) => setEditData({ ...editData, date: e.target.value })}
                            className="w-full px-3 py-2 bg-slate-700 text-white text-sm rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none"
                          />
                        </td>
                        <td className="px-6 py-4">
                          <input
                            type="text"
                            value={editData.description}
                            onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                            className="w-full px-3 py-2 bg-slate-700 text-white text-sm rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none"
                          />
                        </td>
                        <td className="px-6 py-4">
                          <select
                            value={editData.category}
                            onChange={(e) => setEditData({ ...editData, category: e.target.value })}
                            className="w-full px-3 py-2 bg-slate-700 text-white text-sm rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none"
                          >
                            {categories.map(cat => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-6 py-4">
                          <input
                            type="number"
                            value={editData.amount}
                            onChange={(e) => setEditData({ ...editData, amount: e.target.value })}
                            className="w-full px-3 py-2 bg-slate-700 text-white text-sm rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none text-right"
                          />
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={saveEdit}
                              className="p-2 bg-green-500/10 text-green-400 rounded-lg hover:bg-green-500/20 transition-all"
                              title="Simpan"
                            >
                              <Check size={18} />
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="p-2 bg-slate-700 text-slate-400 rounded-lg hover:bg-slate-600 transition-all"
                              title="Batal"
                            >
                              <X size={18} />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-6 py-4 text-slate-300">
                          {new Date(item.date).toLocaleDateString('id-ID', { 
                            day: '2-digit', 
                            month: 'short', 
                            year: 'numeric' 
                          })}
                        </td>
                        <td className="px-6 py-4 text-white font-medium">{item.description}</td>
                        <td className="px-6 py-4 text-slate-300">{item.category}</td>
                        <td className="px-6 py-4 text-right text-blue-400 font-semibold">
                          {formatCurrency(item.amount)}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => startEdit(item)}
                              className="p-2 bg-blue-500/10 text-blue-400 rounded-lg hover:bg-blue-500/20 transition-all"
                              title="Edit"
                            >
                              <Edit2 size={18} />
                            </button>
                            <button
                              onClick={() => deleteExpense(item.id)}
                              className="p-2 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition-all"
                              title="Hapus"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {getFilteredItems(currentMonthData?.items || []).length === 0 && (
            <div className="text-center py-16">
              <div className="inline-block p-6 bg-slate-750 rounded-full mb-4">
                <DollarSign className="text-slate-600" size={48} />
              </div>
              <p className="text-slate-400 text-lg">
                {currentMonthData.items.length === 0 ? 'Belum ada pengeluaran' : 'Tidak ada data yang sesuai dengan filter'}
              </p>
              <p className="text-slate-500 text-sm mt-2">
                {currentMonthData.items.length === 0 ? 'Tambahkan pengeluaran pertama Anda' : 'Coba ubah filter atau reset filter'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExpenseDashboard;