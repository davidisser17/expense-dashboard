import React, { useState, useEffect } from 'react';
import {
  Plus, ArrowLeft, Download, Upload, Trash2, Calendar, CalendarDays, DollarSign,
  Edit2, Check, X, LogOut, Eye, EyeOff, Wallet, Loader2, Utensils, Coffee, Users,
  AlertCircle, ArrowUpRight, ArrowDownRight, Receipt, ChevronRight, Mail
} from 'lucide-react';
import { auth, db } from './firebase';
import { requestGmailAccessToken, scanGmailForExpenses, markMessageAsRead, clearCachedGmailToken } from './gmailSync';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { collection, doc, setDoc, getDoc, getDocs, deleteDoc } from 'firebase/firestore';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Legend } from 'recharts';

/* ==========================================================================
   KONSTANTA STYLE UI (hanya presentasi - tidak ada perubahan logic backend)
   ========================================================================== */
const inputClass =
  'w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all';
const inputCompactClass =
  'px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all';
const editInputClass =
  'w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all';
const btnPrimary =
  'inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl shadow-sm shadow-indigo-600/25 hover:shadow-md transition-all';
const btnGhost =
  'inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-white hover:bg-slate-50 text-slate-600 text-sm font-semibold rounded-xl border border-slate-200 shadow-sm transition-all';

// OAuth Client ID Google untuk sinkronisasi Gmail (tersimpan di kode aplikasi,
// tidak perlu input di browser). Untuk mengganti, ubah nilai di bawah ini.
const GMAIL_CLIENT_ID_DEFAULT = '631899575231-opsuvitd08tj7ef1i3mdj2n2814i887g.apps.googleusercontent.com';

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

  // Gmail sync states
  const [showGmailModal, setShowGmailModal] = useState(false);
  const [gmailStatus, setGmailStatus] = useState('settings'); // 'settings' | 'scanning' | 'preview'
  const [gmailProgress, setGmailProgress] = useState({ done: 0, total: 0 });
  const [gmailCandidates, setGmailCandidates] = useState([]);
  const [gmailError, setGmailError] = useState('');
  const [gmailSaving, setGmailSaving] = useState(false);
  const [gmailPeriod, setGmailPeriod] = useState('month'); // 'month' | 'week' | 'lastWeek' | 'range'
  const [gmailRangeFrom, setGmailRangeFrom] = useState('');
  const [gmailRangeTo, setGmailRangeTo] = useState('');
  const [gmailAccessToken, setGmailAccessToken] = useState('');
  const [gmailScanLabel, setGmailScanLabel] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({ date: '', description: '', category: '', amount: '' });
  const categories = ['Ngopi', 'Makan', 'Nongkrong', 'Tak Terduga'];
  const categoryColors = {
    Makan: '#3B82F6',
    Ngopi: '#8B5CF6',
    Nongkrong: '#F59E0B',
    'Tak Terduga': '#EF4444'
  };
  const categoryIcons = {
    Makan: Utensils,
    Ngopi: Coffee,
    Nongkrong: Users,
    'Tak Terduga': AlertCircle
  };
  const [chartFilter, setChartFilter] = useState('1month');

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
      // Bersihkan juga sesi Gmail yang tersimpan di browser (keamanan)
      clearCachedGmailToken();
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

  /* ---------- Sinkronisasi Gmail ---------- */

  const openGmailModal = () => {
    setGmailError('');
    setGmailCandidates([]);
    setGmailProgress({ done: 0, total: 0 });
    setGmailPeriod('month');
    setGmailStatus('settings');
    setShowGmailModal(true);
  };

  /**
   * Hitung rentang tanggal pemindaian berdasarkan pilihan periode.
   * Return { from: Date, to: Date } dengan `to` eksklusif, atau null jika belum valid.
   */
  const getGmailScanRange = () => {
    if (gmailPeriod === 'month' && selectedMonth) {
      const [year, month] = selectedMonth.split('-').map(Number);
      return { from: new Date(year, month - 1, 1), to: new Date(year, month, 1) };
    }

    if (gmailPeriod === 'week' || gmailPeriod === 'lastWeek') {
      const now = new Date();
      const dayOffset = (now.getDay() + 6) % 7; // Senin sebagai awal minggu
      const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOffset - (gmailPeriod === 'lastWeek' ? 7 : 0));
      return { from: monday, to: new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7) };
    }

    if (gmailPeriod === 'range' && gmailRangeFrom && gmailRangeTo) {
      const from = new Date(`${gmailRangeFrom}T00:00:00`);
      const to = new Date(`${gmailRangeTo}T00:00:00`);
      to.setDate(to.getDate() + 1); // `before:` di Gmail eksklusif
      if (isNaN(from) || isNaN(to) || from > to) return null;
      return { from, to };
    }

    return null;
  };

  const startGmailScan = async () => {
    const range = getGmailScanRange();
    if (!range) {
      setGmailError('Periode belum lengkap. Pilih mode periode atau isi tanggal mulai & akhir dengan benar.');
      return;
    }

    // Format tanggal untuk query Gmail: YYYY/M/D
    const toGmailDate = (d) => `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
    const fmtID = (d) => d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    const lastDay = new Date(range.to.getTime() - 24 * 60 * 60 * 1000);
    const scanLabel = `${fmtID(range.from)} – ${fmtID(lastDay)}`;

    setGmailError('');
    setGmailCandidates([]);
    setGmailProgress({ done: 0, total: 0 });
    setGmailScanLabel(scanLabel);
    setGmailStatus('scanning');

    try {
      // Kumpulkan ID email yang sudah pernah disinkronkan (dari semua bulan)
      const syncedIds = new Set();
      Object.values(expenses).forEach((m) => {
        (m.syncedGmailIds || []).forEach((id) => syncedIds.add(id));
      });

      const scanOptions = {
        dateFrom: toGmailDate(range.from),
        dateTo: toGmailDate(range.to),
        excludeIds: syncedIds
      };

      // Token otomatis diambil dari cache browser — popup izin Google
      // hanya muncul pertama kali, setelah itu tersimpan lokal.
      let token = await requestGmailAccessToken(GMAIL_CLIENT_ID_DEFAULT);
      setGmailAccessToken(token);

      let results;
      try {
        results = await scanGmailForExpenses(
          token,
          (done, total) => setGmailProgress({ done, total }),
          scanOptions
        );
      } catch (scanErr) {
        if (scanErr.sessionExpired) {
          // Token kedaluwarsa di tengah pemindaian → buang cache, minta
          // token baru (senyap, tanpa popup) lalu ulangi sekali lagi
          clearCachedGmailToken();
          token = await requestGmailAccessToken(GMAIL_CLIENT_ID_DEFAULT);
          setGmailAccessToken(token);
          results = await scanGmailForExpenses(
            token,
            (done, total) => setGmailProgress({ done, total }),
            scanOptions
          );
        } else {
          throw scanErr;
        }
      }

      if (!results.length) {
        setGmailError(`Tidak ditemukan email pengeluaran baru pada periode ${scanLabel} (email yang sudah disinkronkan otomatis dilewati).`);
        setGmailStatus('settings');
        return;
      }

      setGmailCandidates(results.map((r) => ({ ...r, selected: true })));
      setGmailStatus('preview');
    } catch (err) {
      setGmailError(err.message || 'Terjadi error saat sinkronisasi Gmail.');
      setGmailStatus('settings');
    }
  };

  const toggleGmailCandidate = (gmailId) => {
    setGmailCandidates((prev) =>
      prev.map((c) => (c.gmailId === gmailId ? { ...c, selected: !c.selected } : c))
    );
  };

  const toggleAllGmailCandidates = () => {
    const allSelected = gmailCandidates.every((c) => c.selected);
    setGmailCandidates((prev) => prev.map((c) => ({ ...c, selected: !allSelected })));
  };

  const setGmailCandidateCategory = (gmailId, category) => {
    setGmailCandidates((prev) =>
      prev.map((c) => (c.gmailId === gmailId ? { ...c, category } : c))
    );
  };

  const saveGmailCandidates = async () => {
    const selected = gmailCandidates.filter((c) => c.selected);
    if (!selected.length) {
      alert('Centang minimal satu transaksi untuk disimpan.');
      return;
    }

    setGmailSaving(true);
    try {
      // Pindahan dari Gmail masuk ke bulan yang sedang dibuka
      const monthData = expenses[selectedMonth];
      if (!monthData) {
        alert('Bulan tidak ditemukan. Buka dulu bulan yang dituju.');
        return;
      }

      const baseId = Date.now();
      const newItems = selected.map((c, i) => ({
        id: baseId + i,
        date: c.date,
        description: c.description,
        category: c.category,
        amount: c.amount
      }));

      // Catat ID email yang sudah disinkronkan agar tidak muncul lagi
      // saat pemindaian berikutnya (dedup lintas bulan).
      const savedIds = selected.map((c) => c.gmailId);
      const updated = {
        ...monthData,
        items: [...monthData.items, ...newItems],
        syncedGmailIds: [...(monthData.syncedGmailIds || []), ...savedIds]
      };
      await saveData(selectedMonth, updated);

      // Tandai email terkait sebagai "sudah dibaca" di Gmail (best effort —
      // dedup sudah terjamin oleh syncedGmailIds meskipun langkah ini gagal).
      if (gmailAccessToken) {
        await Promise.allSettled(savedIds.map((id) => markMessageAsRead(gmailAccessToken, id)));
      }

      setShowGmailModal(false);
      setGmailStatus('settings');
      setGmailCandidates([]);
      setGmailProgress({ done: 0, total: 0 });
      setGmailError('');
    } catch (err) {
      console.error('Gagal menyimpan data Gmail:', err);
      alert('Gagal menyimpan data. Coba lagi.');
    } finally {
      setGmailSaving(false);
    }
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

  const getPreviousMonthComparison = (currentKey) => {
    const currentData = expenses[currentKey];

    if (!currentData) return null;

    let prevMonth = currentData.month - 1;
    let prevYear = currentData.year;

    // Jika Januari → ambil Desember tahun sebelumnya
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear -= 1;
    }

    const prevKey = generateMonthKey(prevMonth, prevYear);
    const prevData = expenses[prevKey];

    // Jika bulan sebelumnya tidak ada data
    if (!prevData) return null;

    const currentTotal = calculateTotal(currentKey);
    const prevTotal = calculateTotal(prevKey);

    const difference = currentTotal - prevTotal;

    const percentage =
      prevTotal > 0
        ? ((difference / prevTotal) * 100).toFixed(1)
        : 0;

    return {
      difference,
      percentage,
      isIncrease: difference > 0,
      prevMonthName: getMonthName(prevMonth),
      prevYear
    };
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const getChartData = () => {
    const now = new Date();

    // =========================
    // 1 WEEK
    // =========================
    if (chartFilter === '1week') {

      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();

      const monthKey = generateMonthKey(currentMonth, currentYear);
      const monthData = expenses[monthKey];

      if (!monthData) return [];

      const weeks = {
        'Week 1': {},
        'Week 2': {},
        'Week 3': {},
        'Week 4': {},
        'Week 5': {}
      };

      categories.forEach(cat => {
        Object.keys(weeks).forEach(week => {
          weeks[week][cat] = 0;
        });
      });

      monthData.items.forEach(item => {

        const day = new Date(item.date).getDate();

        let weekLabel = 'Week 1';

        if (day > 7 && day <= 14) weekLabel = 'Week 2';
        else if (day > 14 && day <= 21) weekLabel = 'Week 3';
        else if (day > 21 && day <= 28) weekLabel = 'Week 4';
        else if (day > 28) weekLabel = 'Week 5';

        weeks[weekLabel][item.category] += item.amount;
      });

      return Object.keys(weeks).map(week => ({
        name: week,
        ...weeks[week]
      }));
    }

    // =========================
    // 1 MONTH
    // =========================
    if (chartFilter === '1month') {

      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();

      const monthKey = generateMonthKey(currentMonth, currentYear);
      const monthData = expenses[monthKey];

      if (!monthData) return [];

      const groupedByDay = {};

      monthData.items.forEach(item => {

        const dateObj = new Date(item.date);

        const day = dateObj.getDate();

        if (!groupedByDay[day]) {

          groupedByDay[day] = {
            name: `${day}`,
            fullDate: dateObj.toLocaleDateString('id-ID', {
              day: 'numeric',
              month: 'long',
              year: 'numeric'
            }),
            Makan: 0,
            Ngopi: 0,
            Nongkrong: 0,
            'Tak Terduga': 0
          };
        }

        groupedByDay[day][item.category] += item.amount;
      });

      return Object.values(groupedByDay).sort(
        (a, b) => parseInt(a.name) - parseInt(b.name)
      );
    }

    // =========================
    // 1 YEAR
    // =========================

    const grouped = {};

    Object.keys(expenses).forEach((key) => {

      const monthData = expenses[key];

      const categoryTotals = {
        Makan: 0,
        Ngopi: 0,
        Nongkrong: 0,
        'Tak Terduga': 0
      };

      monthData.items.forEach(item => {
        categoryTotals[item.category] += item.amount;
      });

      const total =
        categoryTotals.Makan +
        categoryTotals.Ngopi +
        categoryTotals.Nongkrong +
        categoryTotals['Tak Terduga'];

      grouped[key] = {
        name: getMonthName(monthData.month).slice(0, 3),
        fullLabel: `${getMonthName(monthData.month)} ${monthData.year}`,
        total,
        ...categoryTotals,
        rawMonth: monthData.month,
        rawYear: monthData.year
      };
    });

    return Object.values(grouped)
      .sort((a, b) => {
        if (a.rawYear !== b.rawYear) {
          return a.rawYear - b.rawYear;
        }

        return a.rawMonth - b.rawMonth;
      })
      .slice(-12);
  };

  /* ==========================================================================
     HELPER UI (presentasi saja)
     ========================================================================== */
  const CategoryIcon = ({ category, size = 14, className = '' }) => {
    const Icon = categoryIcons[category] || Wallet;
    return <Icon size={size} className={className} />;
  };

  const ChartTooltip = ({ active, payload, label, titleKey }) => {
    if (!active || !payload || !payload.length) return null;

    const total = payload.reduce((sum, item) => sum + item.value, 0);
    const title = payload?.[0]?.payload?.[titleKey] || label;

    return (
      <div className="bg-white/95 backdrop-blur border border-slate-200 rounded-2xl p-4 shadow-xl min-w-[240px]">
        <div className="text-slate-900 text-sm font-bold mb-3">{title}</div>
        <div className="space-y-2">
          {payload.map((item) => (
            <div key={item.dataKey} className="flex items-center justify-between gap-6">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-xs font-semibold" style={{ color: item.color }}>{item.name}</span>
              </div>
              <span className="text-xs text-slate-700 font-semibold tabular-nums">
                {formatCurrency(item.value)}
              </span>
            </div>
          ))}
        </div>
        <div className="border-t border-slate-100 my-3" />
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500 font-medium">Total</span>
          <span className="text-sm text-slate-900 font-bold tabular-nums">{formatCurrency(total)}</span>
        </div>
      </div>
    );
  };

  /* ==========================================================================
     VIEWS
     ========================================================================== */

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
            <Wallet className="text-white" size={28} />
          </div>
          <div className="flex items-center gap-2 text-slate-400 text-sm font-medium">
            <Loader2 className="animate-spin" size={16} />
            Memuat...
          </div>
        </div>
      </div>
    );
  }

  // Login Page
  if (!user) {
    return (
      <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4 bg-slate-50">
        {/* Dekorasi latar */}
        <div className="absolute -top-40 -right-40 w-[28rem] h-[28rem] bg-indigo-200/40 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -left-40 w-[28rem] h-[28rem] bg-violet-200/40 rounded-full blur-3xl pointer-events-none" />

        <div className="relative w-full max-w-md animate-pop-in">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/30 mb-5">
              <Wallet className="text-white" size={30} />
            </div>
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-2">Dashboard Pengeluaran</h1>
            <p className="text-slate-500 text-sm">Kelola keuangan Anda dengan mudah</p>
          </div>

          <div className="bg-white/90 backdrop-blur border border-slate-200/70 rounded-3xl shadow-xl shadow-slate-200/60 p-8">
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-slate-600 text-sm font-semibold mb-2">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  placeholder="nama@email.com"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-600 text-sm font-semibold mb-2">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${inputClass} pr-12`}
                    placeholder="Masukkan password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600 transition-colors"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {authError && (
                <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
                  <p className="text-red-600 text-sm font-medium">{authError}</p>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white rounded-xl font-semibold shadow-lg shadow-indigo-500/25 hover:shadow-xl transition-all"
              >
                Masuk
              </button>
            </form>
          </div>

          <p className="text-center text-slate-400 text-xs mt-6">© {new Date().getFullYear()} Expense Dashboard</p>
        </div>
      </div>
    );
  }

  // Main App - Listing Page (Dashboard)
  if (view === 'list') {
    // Ringkasan statistik (presentasi saja, tidak mengubah data)
    const monthKeys = Object.keys(expenses);
    const grandTotal = monthKeys.reduce((sum, key) => sum + calculateTotal(key), 0);
    const totalTransactions = monthKeys.reduce(
      (sum, key) => sum + (expenses[key]?.items?.length || 0), 0
    );
    const now = new Date();
    const thisMonthKey = generateMonthKey(now.getMonth() + 1, now.getFullYear());
    const thisMonthTotal = expenses[thisMonthKey] ? calculateTotal(thisMonthKey) : 0;

    return (
      <div className="min-h-screen bg-slate-50">
        {/* Navbar */}
        <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-slate-200/60">
          <div className="max-w-6xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/25">
                <Wallet size={18} />
              </div>
              <span className="text-lg font-extrabold text-slate-900 tracking-tight">
                Expense<span className="text-indigo-600">Dash</span>
              </span>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="hidden md:flex items-center gap-2.5">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 text-xs font-bold uppercase">
                  {user?.email?.charAt(0)}
                </div>
                <span className="text-sm text-slate-500 max-w-[180px] truncate">{user?.email}</span>
              </div>
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl shadow-sm hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all"
              >
                <LogOut size={16} />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-4 sm:px-8 py-8">
          {/* Header Halaman */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Dashboard Pengeluaran</h1>
              <p className="text-slate-500 text-sm mt-1">Pantau dan kelola pengeluaran bulanan Anda</p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => exportToCSV()} className={btnGhost}>
                <Download size={18} />
                Export CSV
              </button>
              <button onClick={() => setShowMonthModal(true)} className={btnPrimary}>
                <Plus size={18} />
                Bulan Baru
              </button>
            </div>
          </div>

          {/* Kartu Statistik */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-white border border-slate-200/70 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <p className="text-slate-500 text-xs sm:text-sm font-medium">Total Pengeluaran</p>
                <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                  <Wallet size={16} />
                </span>
              </div>
              <p className="text-lg sm:text-2xl font-extrabold text-slate-900 tracking-tight truncate">{formatCurrency(grandTotal)}</p>
            </div>

            <div className="bg-white border border-slate-200/70 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <p className="text-slate-500 text-xs sm:text-sm font-medium">Bulan Ini</p>
                <span className="p-2 rounded-xl bg-violet-50 text-violet-600">
                  <Calendar size={16} />
                </span>
              </div>
              <p className="text-lg sm:text-2xl font-extrabold text-slate-900 tracking-tight truncate">
                {expenses[thisMonthKey] ? formatCurrency(thisMonthTotal) : '—'}
              </p>
            </div>

            <div className="bg-white border border-slate-200/70 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <p className="text-slate-500 text-xs sm:text-sm font-medium">Total Transaksi</p>
                <span className="p-2 rounded-xl bg-amber-50 text-amber-500">
                  <Receipt size={16} />
                </span>
              </div>
              <p className="text-lg sm:text-2xl font-extrabold text-slate-900 tracking-tight">{totalTransactions}</p>
            </div>

            <div className="bg-white border border-slate-200/70 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <p className="text-slate-500 text-xs sm:text-sm font-medium">Bulan Tercatat</p>
                <span className="p-2 rounded-xl bg-emerald-50 text-emerald-500">
                  <CalendarDays size={16} />
                </span>
              </div>
              <p className="text-lg sm:text-2xl font-extrabold text-slate-900 tracking-tight">{monthKeys.length}</p>
            </div>
          </div>

          {/* Statistik Chart */}
          <div className="bg-white border border-slate-200/70 rounded-3xl shadow-sm p-6 sm:p-8 mb-8">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Statistik Pengeluaran</h2>
                <p className="text-slate-400 text-sm mt-1">Pantau pengeluaran berdasarkan periode waktu</p>
              </div>
              <div className="inline-flex items-center bg-slate-100 rounded-xl p-1 gap-1 self-start lg:self-auto">
                {[
                  { key: '1month', label: 'Bulanan' },
                  { key: '1week', label: 'Mingguan' },
                  { key: '1year', label: 'Tahunan' }
                ].map((item) => (
                  <button
                    key={item.key}
                    onClick={() => setChartFilter(item.key)}
                    className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                      chartFilter === item.key
                        ? 'bg-white text-indigo-600 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                {chartFilter === '1year' ? (
                  <AreaChart data={getChartData()}>
                    <defs>
                      {categories.map((category) => (
                        <linearGradient key={category} id={`grad-${category.replace(/\s+/g, '-')}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={categoryColors[category]} stopOpacity={0.35} />
                          <stop offset="95%" stopColor={categoryColors[category]} stopOpacity={0} />
                        </linearGradient>
                      ))}
                    </defs>

                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />

                    <XAxis
                      dataKey="name"
                      stroke="#94a3b8"
                      interval={0}
                      tickMargin={10}
                      padding={{ left: 20, right: 20 }}
                      tick={{ fontSize: 11 }}
                    />

                    <YAxis
                      stroke="#94a3b8"
                      tick={{ fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      width={64}
                      tickFormatter={(value) => `Rp${(value / 1000).toFixed(0)}k`}
                    />

                    <Tooltip
                      cursor={{ stroke: '#818cf8', strokeWidth: 1, strokeDasharray: '5 5' }}
                      content={<ChartTooltip titleKey="fullLabel" />}
                    />

                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 16 }} iconType="circle" iconSize={8} />

                    {categories.map((category) => (
                      <Area
                        key={category}
                        type="monotone"
                        dataKey={category}
                        stackId="1"
                        stroke={categoryColors[category]}
                        strokeWidth={2}
                        fill={`url(#grad-${category.replace(/\s+/g, '-')})`}
                      />
                    ))}
                  </AreaChart>
                ) : (
                  <BarChart data={getChartData()}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />

                    <XAxis
                      dataKey="name"
                      stroke="#94a3b8"
                      tick={{ fontSize: 11 }}
                    />

                    <YAxis
                      stroke="#94a3b8"
                      tick={{ fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      width={64}
                      tickFormatter={(value) => `Rp${(value / 1000).toFixed(0)}k`}
                    />

                    <Tooltip
                      cursor={{ fill: '#eef2ff' }}
                      content={<ChartTooltip titleKey="fullDate" />}
                    />

                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 16 }} iconType="circle" iconSize={8} />

                    {categories.map((category) => (
                      <Bar
                        key={category}
                        dataKey={category}
                        stackId="a"
                        fill={categoryColors[category]}
                        radius={[4, 4, 0, 0]}
                      />
                    ))}
                  </BarChart>
                )}
              </ResponsiveContainer>

              {getChartData().length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/70 backdrop-blur-[1px]">
                  <Wallet className="text-slate-300" size={32} />
                  <p className="text-slate-400 text-sm font-medium">Belum ada data untuk periode ini</p>
                </div>
              )}
            </div>
          </div>

          {/* Riwayat Bulanan */}
          <div className="flex items-center gap-3 mb-5">
            <h2 className="text-xl font-bold text-slate-900">Riwayat Bulanan</h2>
            {Object.keys(expenses).length > 0 && (
              <span className="px-2.5 py-1 bg-indigo-50 text-indigo-600 text-xs font-bold rounded-full">
                {Object.keys(expenses).length} bulan
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
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
                    className="group bg-white border border-slate-200/70 rounded-2xl p-6 shadow-sm cursor-pointer hover:shadow-xl hover:border-indigo-300 hover:-translate-y-1 transition-all"
                  >
                    <div className="flex items-start justify-between mb-5">
                      <div className="flex items-center gap-3">
                        <div className="p-3 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/25">
                          <Calendar size={20} />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                            {getMonthName(monthData.month)} {monthData.year}
                          </h3>
                          <p className="text-xs text-slate-400">{monthData.items.length} transaksi</p>
                        </div>
                      </div>
                      <ChevronRight className="text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all" size={20} />
                    </div>

                    {/* Mini bar breakdown kategori */}
                    <div className="flex gap-1 h-1.5 rounded-full overflow-hidden bg-slate-100 mb-4">
                      {categories.map(cat => {
                        const catTotal = calculateCategoryTotal(key, cat);
                        const pct = total > 0 ? (catTotal / total) * 100 : 0;
                        return (
                          <div
                            key={cat}
                            style={{ width: `${pct}%`, backgroundColor: categoryColors[cat] }}
                          />
                        );
                      })}
                    </div>

                    <div className="flex items-end justify-between pt-3 border-t border-slate-100">
                      <p className="text-xs text-slate-400">Total Pengeluaran</p>
                      <p className="text-xl font-extrabold text-indigo-600">{formatCurrency(total)}</p>
                    </div>
                  </div>
                );
              })}
          </div>

          {Object.keys(expenses).length === 0 && (
            <div className="bg-white border border-dashed border-slate-300 rounded-3xl py-16 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-400 mb-4">
                <Wallet size={28} />
              </div>
              <p className="text-slate-600 font-semibold">Belum ada data pengeluaran</p>
              <p className="text-slate-400 text-sm mt-1">Klik “Bulan Baru” untuk memulai</p>
            </div>
          )}
        </main>

        {/* Modal Bulan Baru */}
        {showMonthModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-fade-in"
              onClick={() => setShowMonthModal(false)}
            />
            <div className="relative bg-white rounded-3xl shadow-2xl border border-slate-200/60 w-full max-w-md p-8 animate-pop-in">
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-3">
                  <span className="flex items-center justify-center w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600">
                    <CalendarDays size={22} />
                  </span>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Bulan Baru</h2>
                    <p className="text-slate-400 text-xs mt-0.5">Pilih bulan & tahun pengeluaran</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowMonthModal(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4 mb-8">
                <div>
                  <label className="block text-slate-600 text-sm font-semibold mb-2">Bulan</label>
                  <select
                    value={newMonthData.month}
                    onChange={(e) => setNewMonthData({ ...newMonthData, month: parseInt(e.target.value) })}
                    className={inputClass}
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                      <option key={m} value={m}>{getMonthName(m)}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-600 text-sm font-semibold mb-2">Tahun</label>
                  <input
                    type="number"
                    value={newMonthData.year}
                    onChange={(e) => setNewMonthData({ ...newMonthData, year: parseInt(e.target.value) })}
                    className={inputClass}
                    min="2020"
                    max="2099"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setShowMonthModal(false)} className={`${btnGhost} flex-1`}>
                  Batal
                </button>
                <button onClick={createNewMonth} className={`${btnPrimary} flex-1`}>
                  Buat Bulan
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    );
  }

  // Detail Page
  const currentMonthData = expenses[selectedMonth];

  if (!currentMonthData) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-400 mb-4">
            <AlertCircle size={28} />
          </div>
          <p className="text-slate-900 text-2xl font-bold mb-2">Data bulan tidak ditemukan</p>
          <button
            onClick={() => setView('list')}
            className="mt-4 inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold shadow-lg shadow-indigo-600/25 hover:bg-indigo-700 transition-all"
          >
            <ArrowLeft size={18} />
            Kembali
          </button>
        </div>
      </div>
    );
  }

  const total = calculateTotal(selectedMonth);
  const comparison = getPreviousMonthComparison(selectedMonth);
  const gmailSelectedCount = gmailCandidates.filter((c) => c.selected).length;
  const gmailSelectedTotal = gmailCandidates
    .filter((c) => c.selected)
    .reduce((sum, c) => sum + c.amount, 0);
  const gmailScanRange = getGmailScanRange();
  const fmtDateID = (d) => d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  const gmailRangeHint = gmailScanRange
    ? `Rentang pemindaian: ${fmtDateID(gmailScanRange.from)} – ${fmtDateID(new Date(gmailScanRange.to.getTime() - 24 * 60 * 60 * 1000))}`
    : 'Isi tanggal mulai & akhir untuk memindai.';

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Sticky Filter (muncul saat scroll - perilaku tetap sama) */}
      {showStickyFilter && (
        <div className="fixed top-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-b border-slate-200/70 shadow-md z-50 px-4 sm:px-8 py-3 animate-fade-in">
          <div className="max-w-6xl mx-auto flex items-center gap-3">
            <button
              onClick={() => setView('list')}
              className="p-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl shadow-sm hover:bg-slate-50 hover:text-indigo-600 transition-all shrink-0"
              title="Kembali"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-slate-900 truncate">
                {getMonthName(currentMonthData.month)} {currentMonthData.year}
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="date"
                value={filters.date}
                onChange={(e) => setFilters({ ...filters, date: e.target.value })}
                className={`${inputCompactClass} !w-auto`}
              />
              <select
                value={filters.category}
                onChange={(e) => setFilters({ ...filters, category: e.target.value })}
                className={`${inputCompactClass} !w-auto`}
              >
                <option value="Semua">Semua Kategori</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <button
                onClick={() => setFilters({ date: '', category: 'Semua' })}
                className="px-4 py-2 text-sm font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all whitespace-nowrap"
              >
                Reset
              </button>
              <button
                onClick={() => exportToCSV(selectedMonth)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm text-sm font-semibold transition-all whitespace-nowrap"
              >
                <Download size={16} />
                Export
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Navbar */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-slate-200/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/25">
              <Wallet size={18} />
            </div>
            <span className="text-lg font-extrabold text-slate-900 tracking-tight">
              Expense<span className="text-indigo-600">Dash</span>
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden md:flex items-center gap-2.5">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 text-xs font-bold uppercase">
                {user?.email?.charAt(0)}
              </div>
              <span className="text-sm text-slate-500 max-w-[180px] truncate">{user?.email}</span>
            </div>
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl shadow-sm hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-8 py-8">
        {/* Header Detail */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setView('list')}
              className="p-3 bg-white border border-slate-200 text-slate-600 rounded-xl shadow-sm hover:bg-slate-50 hover:text-indigo-600 hover:border-indigo-200 transition-all"
              title="Kembali ke dashboard"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                {getMonthName(currentMonthData.month)} {currentMonthData.year}
              </h1>
              <p className="text-slate-500 text-sm mt-0.5">Detail Pengeluaran</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={openGmailModal} className={btnGhost} title="Ambil data pengeluaran bulan ini dari email">
              <Mail size={18} />
              Sinkron Gmail
            </button>
            <label className={`${btnGhost} cursor-pointer`} title="Import data dari file CSV">
              <Upload size={18} />
              Import CSV
              <input type="file" accept=".csv" onChange={importFromFile} className="hidden" />
            </label>
            <button onClick={() => exportToCSV(selectedMonth)} className={btnGhost}>
              <Download size={18} />
              Export CSV
            </button>
          </div>
        </div>

        {/* Hero Total Pengeluaran */}
        <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-700 rounded-3xl p-8 shadow-xl shadow-indigo-500/20 mb-8">
          <div className="absolute -top-16 -right-16 w-56 h-56 border-[24px] border-white/10 rounded-full pointer-events-none" />
          <div className="absolute -bottom-20 -left-10 w-56 h-56 border-[24px] border-white/10 rounded-full pointer-events-none" />

          <div className="relative">
            <p className="text-indigo-100 text-sm font-medium mb-2">Total Pengeluaran Bulan Ini</p>
            <p className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight break-words">
              {formatCurrency(total)}
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/15 text-white text-xs font-semibold rounded-full backdrop-blur-sm">
                <Receipt size={14} />
                {currentMonthData.items.length} transaksi tercatat
              </span>

              {comparison && (
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full backdrop-blur-sm ${
                    comparison.isIncrease
                      ? 'bg-rose-500/25 text-rose-100'
                      : 'bg-emerald-500/25 text-emerald-100'
                  }`}
                >
                  {comparison.isIncrease ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                  {Math.abs(comparison.percentage)}%
                  {' • '}
                  {comparison.isIncrease
                    ? `Bulan ini lebih boros ${formatCurrency(Math.abs(comparison.difference))}`
                    : `Bulan ini lebih hemat ${formatCurrency(Math.abs(comparison.difference))}`}
                  {' dibanding '}
                  {comparison.prevMonthName} {comparison.prevYear}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Breakdown Kategori */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {categories.map(category => {
            const categoryTotal = calculateCategoryTotal(selectedMonth, category);
            const percentage = total > 0 ? ((categoryTotal / total) * 100).toFixed(1) : 0;
            const CategoryCatIcon = categoryIcons[category];
            const color = categoryColors[category];

            return (
              <div key={category} className="bg-white border border-slate-200/70 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center gap-2.5 mb-3">
                  <span
                    className="p-2 rounded-xl"
                    style={{ backgroundColor: `${color}1A`, color: color }}
                  >
                    <CategoryCatIcon size={15} />
                  </span>
                  <p className="text-slate-500 text-xs font-semibold">{category}</p>
                </div>
                <p className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight mb-3 truncate">
                  {formatCurrency(categoryTotal)}
                </p>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-2">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${percentage}%`, backgroundColor: color }}
                  />
                </div>
                <p className="text-slate-400 text-xs">{percentage}% dari total</p>
              </div>
            );
          })}
        </div>

        {/* Form Tambah Pengeluaran */}
        <div className="bg-white border border-slate-200/70 rounded-3xl shadow-sm p-6 sm:p-8 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <span className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
              <Plus size={20} />
            </span>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Tambah Pengeluaran</h3>
              <p className="text-slate-400 text-xs mt-0.5">Catat pengeluaran baru untuk bulan ini</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Tanggal</label>
              <input
                type="date"
                value={newExpense.date}
                onChange={(e) => setNewExpense({ ...newExpense, date: e.target.value })}
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Pengeluaran</label>
              <input
                type="text"
                placeholder="Contoh: Kopi susu"
                value={newExpense.description}
                onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Kategori</label>
              <select
                value={newExpense.category}
                onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })}
                className={inputClass}
              >
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Jumlah (Rp)</label>
              <input
                type="number"
                placeholder="Contoh: 25000"
                value={newExpense.amount}
                onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
                className={inputClass}
              />
            </div>

            <div className="flex items-end">
              <button
                onClick={addExpense}
                className={`${btnPrimary} w-full`}
              >
                <Plus size={18} />
                Tambah
              </button>
            </div>
          </div>
        </div>

        {/* Tabel Pengeluaran */}
        <div className="bg-white border border-slate-200/70 rounded-3xl shadow-sm overflow-hidden">
          {/* Filter */}
          <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center gap-3">
            <h3 className="text-lg font-bold text-slate-900">Daftar Pengeluaran</h3>
            <div className="sm:ml-auto flex flex-wrap items-center gap-3">
              <input
                type="date"
                value={filters.date}
                onChange={(e) => setFilters({ ...filters, date: e.target.value })}
                className={`${inputCompactClass} !w-auto`}
              />
              <select
                value={filters.category}
                onChange={(e) => setFilters({ ...filters, category: e.target.value })}
                className={`${inputCompactClass} !w-auto`}
              >
                <option value="Semua">Semua Kategori</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              {(filters.date || filters.category !== 'Semua') && (
                <button
                  onClick={() => setFilters({ date: '', category: 'Semua' })}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-500 bg-red-50 hover:bg-red-100 rounded-lg transition-all"
                >
                  <X size={14} />
                  Reset Filter
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left px-6 py-3.5 text-slate-500 text-xs font-bold uppercase tracking-wider">Tanggal</th>
                  <th className="text-left px-6 py-3.5 text-slate-500 text-xs font-bold uppercase tracking-wider">Pengeluaran</th>
                  <th className="text-left px-6 py-3.5 text-slate-500 text-xs font-bold uppercase tracking-wider">Kategori</th>
                  <th className="text-right px-6 py-3.5 text-slate-500 text-xs font-bold uppercase tracking-wider">Jumlah</th>
                  <th className="text-center px-6 py-3.5 text-slate-500 text-xs font-bold uppercase tracking-wider">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {
                  getFilteredItems(
                    [...currentMonthData.items].sort(
                      (a, b) => new Date(b.date) - new Date(a.date)
                    )
                  ).map((item) => (
                    <tr key={item.id} className="hover:bg-indigo-50/40 transition-colors">
                      {editingId === item.id ? (
                        <>
                          <td className="px-6 py-4">
                            <input
                              type="date"
                              value={editData.date}
                              onChange={(e) => setEditData({ ...editData, date: e.target.value })}
                              className={editInputClass}
                            />
                          </td>
                          <td className="px-6 py-4">
                            <input
                              type="text"
                              value={editData.description}
                              onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                              className={editInputClass}
                            />
                          </td>
                          <td className="px-6 py-4">
                            <select
                              value={editData.category}
                              onChange={(e) => setEditData({ ...editData, category: e.target.value })}
                              className={editInputClass}
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
                              className={`${editInputClass} text-right`}
                            />
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={saveEdit}
                                className="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg hover:bg-emerald-500/20 transition-all"
                                title="Simpan"
                              >
                                <Check size={16} />
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="p-2 bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200 transition-all"
                                title="Batal"
                              >
                                <X size={16} />
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-6 py-4 text-slate-500 whitespace-nowrap">
                            {new Date(item.date).toLocaleDateString('id-ID', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric'
                            })}
                          </td>
                          <td className="px-6 py-4 text-slate-800 font-semibold">
                            {item.description}
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                              style={{
                                backgroundColor: `${categoryColors[item.category]}1A`,
                                color: categoryColors[item.category]
                              }}
                            >
                              <CategoryIcon category={item.category} size={12} />
                              {item.category}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right font-bold text-slate-900 whitespace-nowrap tabular-nums">
                            {formatCurrency(item.amount)}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => startEdit(item)}
                                className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                title="Edit"
                              >
                                <Edit2 size={16} />
                              </button>
                              <button
                                onClick={() => deleteExpense(item.id)}
                                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                title="Hapus"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>

          {getFilteredItems(currentMonthData?.items || []).length === 0 && (
            <div className="text-center py-16 px-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-400 mb-4">
                <DollarSign size={28} />
              </div>
              <p className="text-slate-600 font-semibold">
                {currentMonthData.items.length === 0 ? 'Belum ada pengeluaran' : 'Tidak ada data yang sesuai dengan filter'}
              </p>
              <p className="text-slate-400 text-sm mt-1">
                {currentMonthData.items.length === 0 ? 'Tambahkan pengeluaran pertama Anda melalui form di atas' : 'Coba ubah filter atau reset filter'}
              </p>
            </div>
          )}
        </div>
      </main>

          {/* Modal Sinkronisasi Gmail */}
          {showGmailModal && (
            <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
              <div
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-fade-in"
                onClick={() => !gmailSaving && setShowGmailModal(false)}
              />
              <div className="relative bg-white rounded-3xl shadow-2xl border border-slate-200/60 w-full max-w-2xl my-8 p-8 animate-pop-in">
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600">
                      <Mail size={22} />
                    </span>
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">Sinkron Gmail</h2>
                      <p className="text-slate-400 text-xs mt-0.5">
                        Ambil data pengeluaran dari email — {getMonthName(currentMonthData.month)} {currentMonthData.year}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowGmailModal(false)}
                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Tahap 1: Pilih periode & pengaturan */}
                {gmailStatus === 'settings' && (
                  <div>
                    <label className="block text-slate-600 text-sm font-semibold mb-2">Periode Pemindaian</label>
                    <div className="grid grid-cols-3 gap-2 mb-2">
                      {[
                        { key: 'month', label: 'Bulan Ini' },
                        { key: 'week', label: 'Minggu Ini' },
                        { key: 'lastWeek', label: 'Minggu Lalu' }
                      ].map((p) => (
                        <button
                          key={p.key}
                          onClick={() => setGmailPeriod(p.key)}
                          className={`px-3 py-2.5 rounded-xl text-xs sm:text-sm font-semibold border transition-all ${
                            gmailPeriod === p.key
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-600/25'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => setGmailPeriod('range')}
                      className={`w-full px-3 py-2.5 rounded-xl text-xs sm:text-sm font-semibold border transition-all ${
                        gmailPeriod === 'range'
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-600/25'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      Pilih Range Tanggal
                    </button>
                    {gmailPeriod === 'range' && (
                      <div className="grid grid-cols-2 gap-3 mt-3">
                        <input
                          type="date"
                          value={gmailRangeFrom}
                          onChange={(e) => setGmailRangeFrom(e.target.value)}
                          className={inputClass}
                        />
                        <input
                          type="date"
                          value={gmailRangeTo}
                          onChange={(e) => setGmailRangeTo(e.target.value)}
                          className={inputClass}
                        />
                      </div>
                    )}
                    <p className="text-xs text-slate-400 mt-2">{gmailRangeHint}</p>

                    {gmailError && (
                      <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl p-3 mt-4">
                        <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                        <span>{gmailError}</span>
                      </div>
                    )}

                    <button onClick={startGmailScan} className={`${btnPrimary} w-full mt-6`}>
                      <Mail size={18} />
                      Mulai Pemindaian
                    </button>
                  </div>
                )}

                {/* Tahap 2: Memindai email */}
                {gmailStatus === 'scanning' && (
                  <div className="text-center py-10">
                    <Loader2 className="animate-spin text-indigo-600 mx-auto mb-4" size={32} />
                    <p className="font-semibold text-slate-800">
                      Memindai email{gmailScanLabel ? ` — ${gmailScanLabel}` : '...'}
                    </p>
                    <p className="text-slate-400 text-sm mt-1">
                      {gmailProgress.total > 0
                        ? `${gmailProgress.done} dari ${gmailProgress.total} email diperiksa`
                        : 'Menyiapkan pemindaian...'}
                    </p>
                    {gmailProgress.total > 0 && (
                      <div className="w-full bg-slate-100 rounded-full h-2 mt-6 max-w-sm mx-auto overflow-hidden">
                        <div
                          className="bg-indigo-600 h-2 rounded-full transition-all"
                          style={{ width: `${(gmailProgress.done / gmailProgress.total) * 100}%` }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Tahap 3: Preview / Screening data */}
                {gmailStatus === 'preview' && (
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                      <p className="text-sm text-slate-500">
                        <span className="font-bold text-slate-900">{gmailSelectedCount}</span> dari {gmailCandidates.length} transaksi dipilih
                        <span className="mx-1">·</span>
                        Total: <span className="font-bold text-slate-900">{formatCurrency(gmailSelectedTotal)}</span>
                      </p>
                      <button
                        onClick={toggleAllGmailCandidates}
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 underline underline-offset-2"
                      >
                        {gmailCandidates.every((c) => c.selected) ? 'Kosongkan semua' : 'Pilih semua'}
                      </button>
                    </div>

                    <div className="max-h-[380px] overflow-y-auto space-y-2 pr-1">
                      {gmailCandidates.map((c) => (
                        <div
                          key={c.gmailId}
                          className={`border rounded-2xl p-4 flex flex-wrap sm:flex-nowrap items-center gap-3 sm:gap-4 transition-all ${
                            c.selected ? 'border-indigo-200 bg-indigo-50/50' : 'border-slate-200 bg-slate-50 opacity-60'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={c.selected}
                            onChange={() => toggleGmailCandidate(c.gmailId)}
                            className="w-4 h-4 accent-indigo-600 cursor-pointer flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0 basis-full sm:basis-auto">
                            <p className="text-sm font-semibold text-slate-800 truncate" title={c.description}>
                              {c.description}
                            </p>
                            <p className="text-xs text-slate-400 mt-0.5 truncate">
                              {new Date(c.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                              {' · dari '}{c.source}
                            </p>
                          </div>
                          <p className="text-sm font-bold text-slate-900 tabular-nums whitespace-nowrap">
                            {formatCurrency(c.amount)}
                          </p>
                          <select
                            value={c.category}
                            onChange={(e) => setGmailCandidateCategory(c.gmailId, e.target.value)}
                            className={`${inputCompactClass} w-36 flex-shrink-0`}
                            title="Ubah kategori sebelum disimpan"
                          >
                            {categories.map((cat) => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 mt-6">
                      <button onClick={() => setGmailStatus('settings')} className={`${btnGhost} flex-1`}>
                        Kembali
                      </button>
                      <button
                        onClick={saveGmailCandidates}
                        disabled={gmailSaving || gmailSelectedCount === 0}
                        className={`${btnPrimary} flex-1 ${gmailSaving || gmailSelectedCount === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {gmailSaving ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />
                            Menyimpan...
                          </>
                        ) : (
                          <>
                            <Check size={16} />
                            Simpan {gmailSelectedCount} ke Database
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
    </div>
  );
};

export default ExpenseDashboard;
