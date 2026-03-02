
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { CheckCircle, RefreshCw, Edit, Database, Search, Trash2, Users, FileDown, Calendar, MonitorSmartphone, ChevronDown, Loader2, GraduationCap, Printer } from 'lucide-react';
import { parseAndProcessCSV } from './services/dataProcessor';
import { getAllStudents, saveAllStudents, clearDatabase as clearDB } from './services/storage';
import { StudentProcessedData, ProcessingStatus, StudentType } from './types';
import ReportTemplate from './components/ReportTemplate';
import StudentEditor from './components/StudentEditor';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import saveAs from 'file-saver';

const App: React.FC = () => {
  // --- State: Database & UI ---
  const [allStudents, setAllStudents] = useState<StudentProcessedData[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  // --- New: Date Filter State ---
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [dateFilterType, setDateFilterType] = useState<'none' | 'range' | 'specific'>('none');
  const [dateRange, setDateRange] = useState<{start: string, end: string}>({ start: '', end: '' });
  const [selectedSpecificDates, setSelectedSpecificDates] = useState<Set<string>>(new Set());

  const [status, setStatus] = useState<ProcessingStatus>({
    total: 0,
    current: 0,
    isProcessing: false,
    isComplete: false,
    logs: []
  });
  
  // Edit Mode State
  const [editingStudent, setEditingStudent] = useState<StudentProcessedData | null>(null);

  // Hidden ref for PDF generation
  const templateRef = useRef<HTMLDivElement>(null);
  // State to hold the current student being rendered for PDF generation
  const [renderStudent, setRenderStudent] = useState<StudentProcessedData | null>(null);

  // --- 1. Load Data on Mount (IndexedDB) ---
  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await getAllStudents();
        if (data && data.length > 0) {
          setAllStudents(data);
          setStatus(prev => ({
            ...prev,
            logs: [`系统启动：已从数据库加载 ${data.length} 名学生档案`, ...prev.logs]
          }));
        }
      } catch (e) {
        console.error("Failed to load database", e);
        setStatus(prev => ({
            ...prev,
            logs: [`数据库加载失败`, ...prev.logs]
        }));
      }
    };
    loadData();
  }, []);

  // --- 2. Database Operations (IndexedDB) ---

  const saveToStorage = (data: StudentProcessedData[]) => {
    // Fire and forget save operation, with error handling
    saveAllStudents(data).catch(e => {
      console.error("Failed to save to storage", e);
      alert("保存失败：数据库操作异常 (IndexedDB Error)");
    });
  };

  const handleOverwriteUpload = async (event: React.ChangeEvent<HTMLInputElement>, type: StudentType) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = ''; // Reset input

    const typeLabel = type === 'k12' ? 'K12' : '学前';
    setStatus(prev => ({ ...prev, isProcessing: true, logs: [`正在解析 ${typeLabel} 数据文件...`, ...prev.logs] }));

    try {
      // Pass the explicit type to the processor
      const newData = await parseAndProcessCSV(file);
      
      // REPLACEMENT LOGIC: Directly set new data, overwriting the old state
      setAllStudents(newData);
      saveToStorage(newData);
      
      setStatus(prevStatus => ({ 
        ...prevStatus, 
        isProcessing: false, 
        logs: [`导入完成：已加载 ${newData.length} 人 (${typeLabel}模式)`, ...prevStatus.logs] 
      }));
      
      // Clear selection on new import
      setSelectedIds(new Set());
      // Reset filters on new import
      setSearchTerm('');
      resetDateFilter();

    } catch (error) {
      console.error(error);
      setStatus(prev => ({ 
        ...prev, 
        isProcessing: false, 
        logs: ['文件解析失败，请检查格式', ...prev.logs] 
      }));
    }
  };

  const handleDeleteStudent = (id: string, name: string) => {
    if (window.confirm(`确定要删除“${name}”的档案吗？`)) {
      // 1. Update State
      const nextStudents = allStudents.filter(s => s.id !== id);
      setAllStudents(nextStudents);
      
      // 2. Update Storage
      saveToStorage(nextStudents);

      // 3. Update Selection
      if (selectedIds.has(id)) {
         const newSet = new Set(selectedIds);
         newSet.delete(id);
         setSelectedIds(newSet);
      }
      setStatus(prev => ({ ...prev, logs: [`已删除 ${name}`, ...prev.logs] }));
    }
  };

  const handleHardRefresh = async () => {
    if (window.confirm("这将清空所有本地数据并刷新页面，确定吗？")) {
        try {
            await clearDB();
            localStorage.clear();
            window.location.reload();
        } catch (e) {
            console.error(e);
            alert("重置失败");
        }
    }
  };

  const handleClearDatabase = async () => {
    if (window.confirm("确定要清空所有数据吗？")) {
      try {
          await clearDB();
          setAllStudents([]);
          setSelectedIds(new Set());
          setStatus(prev => ({ ...prev, logs: [`数据库已清空`, ...prev.logs] }));
      } catch (e) {
          console.error(e);
          alert("清空失败");
      }
    }
  };

  // --- 3. Date Helpers & Memoization ---
  
  const getStudentDateStr = (ts: number) => {
    if (!ts) return '';
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };

  // Compute available dates and their counts from the current dataset
  const availableDateOptions = useMemo(() => {
    const counts: Record<string, number> = {};
    allStudents.forEach(s => {
      if (s.submitTime > 0) {
        const dateStr = getStudentDateStr(s.submitTime);
        counts[dateStr] = (counts[dateStr] || 0) + 1;
      }
    });
    // Sort descending (newest dates first)
    return Object.entries(counts).sort((a, b) => b[0].localeCompare(a[0]));
  }, [allStudents]);


  // --- 4. Filter & Sort Logic (Search & Newest First) ---
  const filteredStudents = useMemo(() => {
    let result = [...allStudents]; // Copy array for sorting
    
    // 4.1 Filter by Name/Grade
    if (searchTerm.trim()) {
      const lowerTerm = searchTerm.toLowerCase().trim();
      result = result.filter(s => 
        s.name.toLowerCase().includes(lowerTerm) || 
        s.grade.toLowerCase().includes(lowerTerm)
      );
    }

    // 4.2 Filter by Date
    if (dateFilterType === 'range') {
      const start = dateRange.start ? new Date(dateRange.start).getTime() : 0;
      // End date needs to be end of day (23:59:59)
      const end = dateRange.end ? new Date(dateRange.end).getTime() + 86400000 - 1 : Infinity;
      
      result = result.filter(s => {
        if (!s.submitTime) return false;
        return s.submitTime >= start && s.submitTime <= end;
      });
    } else if (dateFilterType === 'specific') {
      if (selectedSpecificDates.size > 0) {
        result = result.filter(s => {
          if (!s.submitTime) return false;
          const sDate = getStudentDateStr(s.submitTime);
          return selectedSpecificDates.has(sDate);
        });
      }
    }
    
    // 4.3 Sort Logic
    return result.sort((a, b) => {
      // Primary: Submit Time
      const timeA = a.submitTime || 0;
      const timeB = b.submitTime || 0;
      
      // If valid times exist, sort DESC (Newest first)
      if (timeA > 0 && timeB > 0) {
         return timeB - timeA;
      }
      // If only one has time, prioritize the one with time
      if (timeA > 0) return -1;
      if (timeB > 0) return 1;

      // Secondary: Upload Timestamp (Newest import first)
      if (b.uploadTimestamp !== a.uploadTimestamp) {
        return b.uploadTimestamp - a.uploadTimestamp;
      }
      
      // Tertiary: CSV Index (Assume typical CSV where bottom = newer, so we show bottom first)
      return (b.csvIndex || 0) - (a.csvIndex || 0);
    });
  }, [allStudents, searchTerm, dateFilterType, dateRange, selectedSpecificDates]);

  // --- 5. Selection Logic ---
  const handleSelectAll = () => {
    if (selectedIds.size === filteredStudents.length && filteredStudents.length > 0) {
      setSelectedIds(new Set());
    } else {
      const allIds = filteredStudents.map(s => s.id);
      setSelectedIds(new Set(allIds));
    }
  };

  const handleToggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleToggleSpecificDate = (dateStr: string) => {
    // 1. Update Specific Dates Set
    const newDateSet = new Set(selectedSpecificDates);
    if (newDateSet.has(dateStr)) {
      newDateSet.delete(dateStr);
    } else {
      newDateSet.add(dateStr);
    }
    setSelectedSpecificDates(newDateSet);

    // 2. AUTO-SELECT LOGIC
    // Rebuild selectedIds based on the new set of dates.
    // This clears previous selections and only checks students belonging to the currently selected dates.
    const newSelectedIds = new Set<string>();
    allStudents.forEach(s => {
      if (s.submitTime) {
        const sDate = getStudentDateStr(s.submitTime);
        if (newDateSet.has(sDate)) {
           newSelectedIds.add(s.id);
        }
      }
    });
    setSelectedIds(newSelectedIds);
  };

  const resetDateFilter = () => {
    setDateFilterType('none');
    setDateRange({ start: '', end: '' });
    setSelectedSpecificDates(new Set());
    setSelectedIds(new Set()); // Also clear selection on reset
    setShowDateFilter(false);
  };

  // --- 6. Helpers ---
  
  const getTimeParts = (ts: number) => {
     if (!ts) return { date: '', time: '' };
     const date = new Date(ts);
     const m = (date.getMonth() + 1).toString();
     const d = date.getDate().toString();
     const h = date.getHours().toString().padStart(2, '0');
     const min = date.getMinutes().toString().padStart(2, '0');
     return { date: `${m}月${d}日`, time: `${h}:${min}` };
  };

  // --- 7. PDF Generation Logic ---

  const generateSinglePDF = async (student: StudentProcessedData) => {
    setStatus(prev => ({ ...prev, isProcessing: true, current: 0, logs: [`正在生成 ${student.name} 的PDF...`, ...prev.logs] }));
    setRenderStudent(student);
    
    // Allow React to render the hidden template
    await new Promise(resolve => setTimeout(resolve, 500)); 

    if (templateRef.current) {
      try {
        const pages = templateRef.current.querySelectorAll('.report-page');
        if (pages.length > 0) {
          // Initialize PDF with default A4. We will adjust subsequent pages if needed.
          // compress: true is important when using High-DPI images to keep file size reasonable
          const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
          const pdfWidth = 210;

          for (let p = 0; p < pages.length; p++) {
            const pageEl = pages[p] as HTMLElement;
            
            // High-DPI Capture
            // Scale 3 = ~300 DPI (Printing Standard)
            // Scale 1.5 was ~144 DPI (Screen Standard)
            const canvas = await html2canvas(pageEl, { 
              scale: 3, 
              useCORS: true, 
              logging: false,
              // Improve text rendering
              onclone: (doc) => {
                const el = doc.querySelector('.report-page') as HTMLElement;
                if (el) (el.style as any).fontSmooth = 'always';
              }
            });
            
            // Use Quality 1.0 to prevent compression artifacts on text
            const imgData = canvas.toDataURL('image/jpeg', 1.0);
            
            // Calculate height to maintain aspect ratio for variable length pages
            const imgProps = pdf.getImageProperties(imgData);
            const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

            if (p > 0) {
              // For pages after the cover, adapt page size to content height (e.g. for long Grade 1 pages)
              pdf.addPage([pdfWidth, pdfHeight]);
            } else {
              // For Cover (p=0), it defaults to A4. 
            }
            
            pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
          }
          pdf.save(`${student.name}-专属学习方案.pdf`);
          setStatus(prev => ({ ...prev, isProcessing: false, logs: [`${student.name} PDF 下载成功`, ...prev.logs] }));
        }
      } catch (err) {
        console.error(err);
        setStatus(prev => ({ ...prev, isProcessing: false, logs: ['生成失败', ...prev.logs] }));
      }
    }
    setRenderStudent(null);
  };

  // --- Standard Batch PDF (Variable height pages allowed) ---
  const generateBatchPDFs = async () => {
    // Logic change: If items are selected, only export those. Otherwise export all filtered.
    let targets = filteredStudents;
    if (selectedIds.size > 0) {
      targets = allStudents.filter(s => selectedIds.has(s.id));
      // Re-sort selected targets to match the display order
      targets.sort((a, b) => {
         const timeA = a.submitTime || 0;
         const timeB = b.submitTime || 0;
         if (timeA > 0 && timeB > 0) return timeB - timeA;
         if (timeA > 0) return -1;
         if (timeB > 0) return 1;
         
         if (b.uploadTimestamp !== a.uploadTimestamp) return b.uploadTimestamp - a.uploadTimestamp;
         return (b.csvIndex || 0) - (a.csvIndex || 0);
      });
    }

    if (targets.length === 0) return;

    // Explicitly set total here
    setStatus(prev => ({ 
      ...prev, 
      isProcessing: true, 
      current: 0, 
      total: targets.length,
      isComplete: false, 
      logs: [`开始批量生成 ${targets.length} 份报告 (数码版)...`, ...prev.logs] 
    }));

    const zip = new JSZip();
    const folderName = selectedIds.size > 0 
       ? `课程推荐_选中导出_${new Date().toISOString().split('T')[0]}`
       : `课程推荐_批量导出_${new Date().toISOString().split('T')[0]}`;
       
    const folder = zip.folder(folderName);

    for (let i = 0; i < targets.length; i++) {
      const student = targets[i];
      setRenderStudent(student);
      
      // Update status for current student
      setStatus(prev => ({ ...prev, current: i + 1, logs: [`正在处理: ${student.name} (${i+1}/${targets.length})`, ...prev.logs.slice(0, 3)] }));
      
      await new Promise(resolve => setTimeout(resolve, 100)); // Short delay for React render

      if (templateRef.current) {
        try {
          const pages = templateRef.current.querySelectorAll('.report-page');
          if (pages.length > 0) {
            // Enable compression for batch processing to save memory
            const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
            const pdfWidth = 210;

            for (let p = 0; p < pages.length; p++) {
              const pageEl = pages[p] as HTMLElement;
              
              // Scale 3 = Print Quality (approx 300 DPI)
              const canvas = await html2canvas(pageEl, { 
                scale: 3, 
                useCORS: true,
                logging: false
              });
              
              // Quality 0.95 is a good balance for batch processing (visibly lossless, slightly smaller file)
              const imgData = canvas.toDataURL('image/jpeg', 0.95);
              
              // Dynamic Height Logic
              const imgProps = pdf.getImageProperties(imgData);
              const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

              if (p > 0) {
                pdf.addPage([pdfWidth, pdfHeight]);
              }
              
              pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
            }
            if (folder) folder.file(`${student.name}-专属学习方案.pdf`, pdf.output('blob'));
          }
        } catch (err) {
          console.error(err);
          setStatus(prev => ({ ...prev, logs: [`Error: ${student.name} 生成失败`, ...prev.logs] }));
        }
      }
    }
    
    setStatus(prev => ({ ...prev, logs: ['正在打包 ZIP 文件...', ...prev.logs] }));
    const zipContent = await zip.generateAsync({ type: 'blob' });
    saveAs(zipContent, `${folderName}.zip`);
    
    setStatus(prev => ({ ...prev, isProcessing: false, isComplete: true, renderStudent: null, logs: ['导出任务完成', ...prev.logs] }));
    setRenderStudent(null);
  };

  // --- HARD CUT A4 Printable Batch PDF ---
  const generatePrintableBatch = async () => {
    let targets = filteredStudents;
    if (selectedIds.size > 0) {
      targets = allStudents.filter(s => selectedIds.has(s.id));
      targets.sort((a, b) => {
         const timeA = a.submitTime || 0;
         const timeB = b.submitTime || 0;
         if (timeA > 0 && timeB > 0) return timeB - timeA;
         if (timeA > 0) return -1;
         if (timeB > 0) return 1;
         if (b.uploadTimestamp !== a.uploadTimestamp) return b.uploadTimestamp - a.uploadTimestamp;
         return (b.csvIndex || 0) - (a.csvIndex || 0);
      });
    }

    if (targets.length === 0) return;

    setStatus(prev => ({ 
      ...prev, 
      isProcessing: true, 
      current: 0, 
      total: targets.length,
      isComplete: false, 
      logs: [`开始生成 ${targets.length} 份 A4 打印版报告...`, ...prev.logs] 
    }));

    const zip = new JSZip();
    const folderName = selectedIds.size > 0 
       ? `课程推荐_A4打印版_${new Date().toISOString().split('T')[0]}`
       : `课程推荐_批量A4打印版_${new Date().toISOString().split('T')[0]}`;
       
    const folder = zip.folder(folderName);

    for (let i = 0; i < targets.length; i++) {
      const student = targets[i];
      setRenderStudent(student);
      
      setStatus(prev => ({ ...prev, current: i + 1, logs: [`正在切图: ${student.name} (${i+1}/${targets.length})`, ...prev.logs.slice(0, 3)] }));
      
      await new Promise(resolve => setTimeout(resolve, 200));

      if (templateRef.current) {
        try {
          const pages = templateRef.current.querySelectorAll('.report-page');
          if (pages.length > 0) {
            // FORCE A4 SIZE for all pages
            const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
            const pageWidth = 210;
            const pageHeight = 297; // A4 Standard Height

            for (let p = 0; p < pages.length; p++) {
              const pageEl = pages[p] as HTMLElement;
              
              // High Quality Capture
              const canvas = await html2canvas(pageEl, { 
                scale: 3, 
                useCORS: true,
                logging: false,
                onclone: (doc) => {
                  const el = doc.querySelector('.report-page') as HTMLElement;
                  if (el) (el.style as any).fontSmooth = 'always';
                }
              });
              
              const imgData = canvas.toDataURL('image/jpeg', 0.95);
              
              // Calculate how tall the image is when fitted to A4 width
              const imgHeight = (canvas.height * pageWidth) / canvas.width;
              
              // "Hard Cut" Logic:
              // If image is taller than 297mm, slice it across multiple PDF pages.
              let heightLeft = imgHeight;
              let position = 0;

              // If it's not the very first page of the PDF, add a new sheet
              if (p > 0) {
                pdf.addPage();
              }

              // First slice of this DOM element
              pdf.addImage(imgData, 'JPEG', 0, position, pageWidth, imgHeight);
              heightLeft -= pageHeight;

              // Subsequent slices (if content > A4)
              while (heightLeft > 0) {
                position -= pageHeight; // Shift image up to reveal next section
                pdf.addPage();
                pdf.addImage(imgData, 'JPEG', 0, position, pageWidth, imgHeight);
                heightLeft -= pageHeight;
              }
            }
            if (folder) folder.file(`${student.name}-A4打印版.pdf`, pdf.output('blob'));
          }
        } catch (err) {
          console.error(err);
          setStatus(prev => ({ ...prev, logs: [`Error: ${student.name} 生成失败`, ...prev.logs] }));
        }
      }
    }
    
    setStatus(prev => ({ ...prev, logs: ['正在打包 ZIP 文件...', ...prev.logs] }));
    const zipContent = await zip.generateAsync({ type: 'blob' });
    saveAs(zipContent, `${folderName}.zip`);
    
    setStatus(prev => ({ ...prev, isProcessing: false, isComplete: true, renderStudent: null, logs: ['导出任务完成', ...prev.logs] }));
    setRenderStudent(null);
  };

  const handleSaveStudent = (updatedStudent: StudentProcessedData) => {
    setAllStudents(prev => {
      const next = prev.map(s => s.id === updatedStudent.id ? updatedStudent : s);
      saveToStorage(next); 
      return next;
    });
    setEditingStudent(null);
    setStatus(prev => ({ ...prev, logs: [`已更新 ${updatedStudent.name} 的方案`, ...prev.logs] }));
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-10 px-4 relative">
      
      {/* Hidden container for PDF rendering */}
      <div className="absolute top-0 left-0 overflow-hidden h-0 w-0">
         <div style={{ position: 'absolute', top: '-10000px', left: '-10000px' }}>
            {renderStudent && <ReportTemplate ref={templateRef} data={renderStudent} />}
         </div>
      </div>

      {/* --- PROGRESS MODAL OVERLAY --- */}
      {status.isProcessing && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-6 border border-gray-200 animate-in fade-in zoom-in duration-300">
              <div className="flex flex-col items-center text-center mb-6">
                 <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mb-4">
                   <Loader2 size={32} className="animate-spin" />
                 </div>
                 <h3 className="text-xl font-bold text-gray-800">
                   {status.total > 0 ? `正在导出 ${status.current} / ${status.total}` : '正在处理...'}
                 </h3>
                 <p className="text-sm text-gray-500 mt-2">请勿关闭浏览器窗口，稍候片刻...</p>
              </div>

              {/* Progress Bar */}
              {status.total > 0 && (
                <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden mb-4">
                   <div 
                      className="h-full bg-indigo-600 transition-all duration-300 ease-out"
                      style={{ width: `${(status.current / status.total) * 100}%` }}
                   ></div>
                </div>
              )}
              
              {/* Latest Log */}
              <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 font-mono border border-gray-100 min-h-[40px] flex items-center justify-center">
                 {status.logs[0] || '初始化中...'}
              </div>
           </div>
        </div>
      )}

      {/* Editor Modal */}
      {editingStudent && (
        <StudentEditor 
          student={editingStudent} 
          onSave={handleSaveStudent}
          onCancel={() => setEditingStudent(null)}
          isGenerating={status.isProcessing} // Pass the loading state
          onGenerateSinglePDF={(s) => {
             setTimeout(() => generateSinglePDF(s), 0);
          }}
        />
      )}

      <header className="mb-8 text-center max-w-2xl">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">《北清领学营》</h1>
        <p className="text-gray-500">自动化学生课程推荐与方案生成系统</p>
      </header>

      <main className="w-full max-w-4xl space-y-6">
        
        {/* Module 1: Database Import */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
           <div className="flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center shrink-0">
                    <Database size={24} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-800">数据导入</h2>
                    <p className="text-sm text-gray-500">
                      请选择问卷类型进行导入。注意：<strong>新文件将覆盖现有列表</strong>。
                    </p>
                  </div>
              </div>
              
              <div className="flex gap-4">
                  {/* K12 Import Button */}
                  <label className="cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-lg font-bold shadow-md transition-all flex items-center gap-3 group relative overflow-hidden">
                    <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <GraduationCap size={20} className="shrink-0" />
                    <div className="flex flex-col items-start">
                       <span className="text-sm leading-tight">K12 数据导入</span>
                       <span className="text-[10px] font-normal opacity-80">小初高 · 成绩分析</span>
                    </div>
                    <input type="file" accept=".csv" onChange={(e) => handleOverwriteUpload(e, 'k12')} className="hidden" disabled={status.isProcessing} />
                  </label>
              </div>
           </div>
        </div>

        {/* Module 2: Student Database & Search */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col h-[700px]">
           {/* Toolbar */}
           <div className="p-6 border-b border-gray-100 flex flex-col md:flex-row justify-between items-center gap-4 bg-gray-50/50 rounded-t-xl relative z-10">
              <div className="flex items-center gap-4">
                 <div className="flex items-center gap-2 text-gray-700">
                    <Users size={20} className="text-gray-400" />
                    <span className="font-bold text-lg">学员列表</span>
                    <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">{allStudents.length} 人</span>
                 </div>

                 {/* Select All Checkbox */}
                 {filteredStudents.length > 0 && (
                   <div 
                      onClick={handleSelectAll} 
                      className="flex items-center gap-2 cursor-pointer hover:bg-gray-200 px-2 py-1 rounded transition-colors select-none"
                   >
                     <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                       selectedIds.size === filteredStudents.length && filteredStudents.length > 0
                         ? 'bg-indigo-600 border-indigo-600' 
                         : 'bg-white border-gray-400'
                     }`}>
                       {selectedIds.size === filteredStudents.length && filteredStudents.length > 0 && <CheckCircle size={12} className="text-white" />}
                     </div>
                     <span className="text-sm text-gray-600 font-medium">
                       {selectedIds.size > 0 ? `已选 ${selectedIds.size} 人` : '全选'}
                     </span>
                   </div>
                 )}
              </div>

              <div className="flex items-center gap-3 w-full md:w-auto">
                 {/* Date Filter Button */}
                 <div className="relative">
                   <button 
                     onClick={() => setShowDateFilter(!showDateFilter)}
                     className={`flex items-center gap-2 px-3 py-2.5 border rounded-lg text-sm font-medium transition-colors"
                       ${dateFilterType !== 'none' ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}
                     `}
                   >
                     <Calendar size={16} />
                     <span>日期筛选</span>
                     <ChevronDown size={14} className={`transition-transform ${showDateFilter ? 'rotate-180' : ''}`} />
                   </button>
                   
                   {/* Date Filter Dropdown */}
                   {showDateFilter && (
                     <div className="absolute top-full right-0 mt-2 w-80 bg-white border border-gray-200 shadow-xl rounded-xl p-4 z-50">
                       <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-100">
                         <h3 className="font-bold text-gray-700">筛选问卷提交日期</h3>
                         <button onClick={resetDateFilter} className="text-xs text-red-500 hover:text-red-600 font-medium">重置</button>
                       </div>
                       
                       {/* Filter Mode Tabs */}
                       <div className="flex gap-2 mb-4 bg-gray-50 p-1 rounded-lg">
                          <button 
                            onClick={() => setDateFilterType('range')}
                            className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${
                              dateFilterType === 'range' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                            }`}
                          >
                            按时间范围
                          </button>
                          <button 
                             onClick={() => setDateFilterType('specific')}
                             className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${
                               dateFilterType === 'specific' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                             }`}
                          >
                             按日期点选
                          </button>
                       </div>

                       {/* Mode 1: Range */}
                       {dateFilterType === 'range' && (
                         <div className="space-y-3">
                           <div>
                             <label className="text-xs text-gray-500 block mb-1">开始日期</label>
                             <input 
                               type="date" 
                               value={dateRange.start} 
                               onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                               className="w-full text-sm border border-gray-200 rounded p-2 focus:ring-2 focus:ring-indigo-500 outline-none" 
                             />
                           </div>
                           <div>
                             <label className="text-xs text-gray-500 block mb-1">结束日期</label>
                             <input 
                               type="date" 
                               value={dateRange.end} 
                               onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                               className="w-full text-sm border border-gray-200 rounded p-2 focus:ring-2 focus:ring-indigo-500 outline-none" 
                             />
                           </div>
                           <div className="text-xs text-gray-400 mt-2">
                             * 筛选在该时间段内提交问卷的学员
                           </div>
                         </div>
                       )}

                       {/* Mode 2: Specific Dates (Checkboxes) */}
                       {dateFilterType === 'specific' && (
                         <div className="max-h-60 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                           {availableDateOptions.length === 0 ? (
                             <div className="text-center text-gray-400 text-xs py-4">无可用日期数据</div>
                           ) : (
                             availableDateOptions.map(([dateStr, count]) => (
                               <label key={dateStr} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded cursor-pointer border border-transparent hover:border-gray-100">
                                 <div className="flex items-center gap-2">
                                   <div className={`w-4 h-4 rounded border flex items-center justify-center ${selectedSpecificDates.has(dateStr) ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-gray-300'}`}>
                                     {selectedSpecificDates.has(dateStr) && <CheckCircle size={10} className="text-white" />}
                                   </div>
                                   <span className="text-sm text-gray-700">{dateStr}</span>
                                 </div>
                                 <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{count}人</span>
                                 <input 
                                   type="checkbox" 
                                   className="hidden" 
                                   checked={selectedSpecificDates.has(dateStr)}
                                   onChange={() => handleToggleSpecificDate(dateStr)}
                                 />
                               </label>
                             ))
                           )}
                         </div>
                       )}
                       
                       {/* Footer Actions */}
                       <div className="mt-4 pt-3 border-t border-gray-100 flex justify-end">
                         <button 
                           onClick={() => setShowDateFilter(false)}
                           className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
                         >
                           确认筛选
                         </button>
                       </div>
                     </div>
                   )}
                 </div>

                 {/* Search Bar */}
                 <div className="relative w-full md:w-56 group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-indigo-500 transition-colors" size={18} />
                    <input 
                      type="text" 
                      placeholder="搜索姓名或年级..." 
                      className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                 </div>

                 {/* Batch Export Button - Adaptive */}
                 {(filteredStudents.length > 0) && (
                   <div className="flex gap-2">
                     <button 
                        onClick={generateBatchPDFs}
                        disabled={status.isProcessing}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-bold text-sm transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap
                          ${selectedIds.size > 0 
                            ? 'bg-indigo-600 hover:bg-indigo-700 text-white' 
                            : 'bg-gray-900 hover:bg-black text-white'
                          }
                        `}
                     >
                        {status.isProcessing ? (
                           <RefreshCw size={16} className="animate-spin" />
                        ) : (
                           <FileDown size={16} />
                        )}
                        <span className="hidden md:inline">
                          {selectedIds.size > 0 ? `导出选中 (${selectedIds.size})` : `导出筛选 (${filteredStudents.length})`}
                        </span>
                        <span className="md:hidden">导出</span>
                     </button>

                     {/* New: Hard Cut A4 Printable Button */}
                     <button 
                        onClick={generatePrintableBatch}
                        disabled={status.isProcessing}
                        title="生成严格 A4 分页的打印版 PDF (硬切模式)"
                        className="flex items-center gap-2 px-3 py-2.5 rounded-lg font-bold text-sm transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed bg-orange-500 hover:bg-orange-600 text-white"
                     >
                        <Printer size={16} />
                        <span className="hidden md:inline">A4打印版</span>
                     </button>

                     {/* Hard Refresh Button */}
                     <button 
                        onClick={handleHardRefresh}
                        className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-3 py-2.5 rounded-lg font-bold text-sm transition-all shadow-sm flex items-center gap-2"
                        title="清空所有数据并刷新页面"
                     >
                        <Trash2 size={16} />
                        <span className="hidden md:inline">重置</span>
                     </button>
                   </div>
                 )}
                 
                 {allStudents.length > 0 && (
                   <button 
                     onClick={handleClearDatabase}
                     title="清空列表"
                     className="p-2.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                   >
                     <Trash2 size={18} />
                   </button>
                 )}
              </div>
           </div>

           {/* List View */}
           <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-gray-50/30">
              {filteredStudents.length === 0 ? (
                 <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-3">
                    <Search size={48} className="opacity-20" />
                    <p>没有找到匹配的学员档案</p>
                    {allStudents.length === 0 && <p className="text-xs">请先点击上方按钮导入数据</p>}
                 </div>
              ) : (
                 filteredStudents.map(student => {
                    const isSelected = selectedIds.has(student.id);
                    const { date: timeDate, time: timeHour } = getTimeParts(student.submitTime);

                    return (
                      <div key={student.id} 
                           className={`p-4 rounded-xl border transition-all group flex items-center justify-between
                             ${isSelected ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-gray-100 hover:border-indigo-200 hover:shadow-md'}
                           `}>
                         <div className="flex items-center gap-4">
                            {/* Checkbox */}
                            <div 
                              onClick={() => handleToggleSelect(student.id)}
                              className="cursor-pointer p-1"
                            >
                              <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                                isSelected ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-gray-300 hover:border-indigo-400'
                              }`}>
                                {isSelected && <CheckCircle size={14} className="text-white" />}
                              </div>
                            </div>

                            {/* Avatar - Updated to Purple style matching screenshot */}
                            <div className="w-11 h-11 bg-[#8b5cf6] rounded-full text-white flex items-center justify-center font-bold text-lg shadow-sm shrink-0">
                               {student.name.substring(0, 1)}
                            </div>
                            
                            <div className="flex flex-col gap-1">
                               {/* Row 1: Name + Badges */}
                               <div className="flex items-center gap-2">
                                  <h3 className="font-bold text-gray-900 text-[16px]">{student.name}</h3>

                                  {/* Grade Badge - Light Gray Pill */}
                                  <span className="px-2 py-[2px] bg-gray-100 text-gray-600 text-xs rounded-[4px] border border-gray-200 font-medium">
                                    {student.grade}
                                  </span>
                                  
                                  {/* Machine Brand Badge */}
                                  {(() => {
                                    let badgeStyle = 'bg-orange-50 text-orange-600 border-orange-100';
                                    let badgeLabel = '学而思';

                                    if (student.machineType === 'iflytek') {
                                        badgeStyle = 'bg-blue-50 text-blue-600 border-blue-100';
                                        badgeLabel = '科大讯飞';
                                    } else if (student.machineType === 'bubugao') {
                                        badgeStyle = 'bg-emerald-50 text-emerald-600 border-emerald-100';
                                        badgeLabel = '步步高';
                                    }

                                    return (
                                      <span className={`px-2 py-[2px] rounded-[4px] text-xs border flex items-center gap-1 font-medium ${badgeStyle}`}>
                                        <MonitorSmartphone size={10} />
                                        {badgeLabel}
                                      </span>
                                    );
                                  })()}

                                  {/* Type Badge (Visible Debug) - Removed */}
                               </div>
                               
                               {/* Row 2: Scores - UPDATED to use original text ranges/strings */}
                               <div className="text-xs text-gray-400 flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                                    <>
                                      <span title={student.originalScores.math}>数 {student.originalScores.math || '-'}</span>
                                      <span className="text-gray-300">/</span>
                                      <span title={student.originalScores.chinese}>语 {student.originalScores.chinese || '-'}</span>
                                      <span className="text-gray-300">/</span>
                                      <span title={student.originalScores.english}>英 {student.originalScores.english || '-'}</span>
                                    </>
                               </div>
                            </div>
                         </div>

                         {/* Right Side: Time + Buttons */}
                         <div className="flex items-center gap-4">
                            {/* TIME DISPLAY - Moved to the right */}
                            {student.submitTime > 0 && (
                               <div className="flex flex-col items-end mr-2">
                                  <span className="text-xs text-gray-500 font-bold flex items-center gap-1">
                                    {timeDate}
                                  </span>
                                  <span className="text-[10px] text-gray-400">
                                    {timeHour}
                                  </span>
                               </div>
                            )}

                            <div className="flex items-center gap-2">
                                <button 
                                   onClick={() => generateSinglePDF(student)}
                                   disabled={status.isProcessing}
                                   title="下载专属PDF方案"
                                   className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors disabled:opacity-50"
                                >
                                   <FileDown size={14} /> <span className="hidden md:inline">下载</span>
                                </button>
                                <button 
                                   onClick={() => setEditingStudent(student)}
                                   className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                                >
                                   <Edit size={14} /> <span className="hidden md:inline">编辑</span>
                                </button>
                                <button 
                                   onClick={() => handleDeleteStudent(student.id, student.name)}
                                   className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                >
                                   <Trash2 size={18} />
                                </button>
                            </div>
                         </div>
                      </div>
                    );
                 })
              )}
           </div>

           {/* Footer Action - Status Only */}
           <div className="p-4 border-t border-gray-100 bg-white rounded-b-xl flex justify-between items-center">
              <div className="text-xs text-gray-400">
                 {status.logs[0] || '系统就绪'}
              </div>
           </div>
        </div>

      </main>

      <footer className="mt-12 text-gray-400 text-sm flex flex-col items-center gap-2">
        <p>&copy; 2026.1.15.1 北清领学营</p>
        <p className="text-xs text-gray-300">数据仅保存在您的本地浏览器中，请勿清除浏览器缓存以免丢失数据。</p>
      </footer>
    </div>
  );
};

export default App;
