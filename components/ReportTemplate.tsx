
import React, { forwardRef } from 'react';
import { StudentProcessedData, CurriculumItem } from '../types';
import { BookOpen, Monitor, PenTool, RotateCcw, Rocket, CheckCircle2, AlertCircle, MonitorPlay, Pencil, Sun, CalendarDays, Coffee, Star, MonitorSmartphone, Camera } from 'lucide-react';

interface ReportTemplateProps {
  data: StudentProcessedData | null;
}

// Helper to parse content with brackets like 【必做】【15分钟】
// Returns an object with tags and cleaned text
const parseObjective = (text: string) => {
  const tagRegex = /【([^】]+)】/g;
  const tags: string[] = [];
  let match;
  while ((match = tagRegex.exec(text)) !== null) {
    tags.push(match[1]);
  }
  const cleanText = text.replace(tagRegex, '').trim();
  return { tags, cleanText };
};

// Helper to clean project name "1、Title" -> "Title"
// Removes leading numbers followed by typical separators
const cleanProjectName = (text: string) => {
  if (!text) return '';
  return text.replace(/^\d+[、\.\s]\s*/, '');
};

// --- DYNAMIC PAGINATION LOGIC (For Standard/High School Pages) ---

// Constants for A4 layout (in pixels)
// A4 height is ~1123px. 
const PAGE_CONTENT_HEIGHT_LIMIT = 880; 
const ITEM_GAP = 16; 

// Estimate the height of a single curriculum item card
const estimateItemHeight = (item: CurriculumItem): number => {
  let height = 72; // Base padding + headers

  const { cleanText } = parseObjective(item.objective);
  
  const charsPerLine = 46; // Conservative estimate for width
  const textLength = cleanText.length;
  const lineCount = Math.ceil(textLength / charsPerLine) || 1;
  const textHeight = lineCount * 18; // Line height
  
  const tagHeight = 28; 
  const pathHeight = item.path ? 42 : 0;

  height += textHeight + tagHeight + pathHeight;

  return height;
};

// Function to distribute items into pages based on height
const paginateItems = (items: CurriculumItem[]): CurriculumItem[][] => {
  const pages: CurriculumItem[][] = [];
  let currentPage: CurriculumItem[] = [];
  let currentHeight = 0;

  items.forEach((item) => {
    const itemH = estimateItemHeight(item);
    
    // Determine if we need to break
    const isFirstItemOnPage = currentPage.length === 0;
    const projectedHeight = currentHeight + itemH + (isFirstItemOnPage ? 0 : ITEM_GAP);

    if (!isFirstItemOnPage && projectedHeight > PAGE_CONTENT_HEIGHT_LIMIT) {
      pages.push(currentPage);
      currentPage = [item];
      currentHeight = itemH;
    } else {
      if (!isFirstItemOnPage) {
        currentHeight += ITEM_GAP;
      }
      currentPage.push(item);
      currentHeight += itemH;
    }
  });

  if (currentPage.length > 0) {
    pages.push(currentPage);
  }

  return pages;
};

// --- SCHEDULE STYLE CATEGORIZATION (Grades 1-9) ---
type ScheduleCategory = 'watch' | 'practice' | 'weekend' | 'entry';

const categorizeScheduleItem = (item: CurriculumItem): ScheduleCategory => {
  const mod = item.module.toLowerCase();
  
  // 0. Entry (New Feature)
  if (mod.includes('录入') || mod.includes('entry')) {
    return 'entry';
  }

  // 1. Weekend / Extension
  // Strong check for "周末", "拓展" (Extension), "阅读" (Reading - usually weekend), or "素养" (Literacy)
  if (mod.includes('周末') || mod.includes('拓展') || mod.includes('阅读') || item.subject === '素养') {
    return 'weekend';
  }

  // 2. Watch / Video / Preview
  if (mod.includes('看课') || mod.includes('视频') || mod.includes('预习')) {
    return 'watch';
  }

  // 3. Practice / Exercise (Default fallback)
  return 'practice';
};

// --- NEW: Personalized Diagnosis Generator (Teacher Sun Persona) ---
const generateDiagnosisText = (data: StudentProcessedData) => {
  if (data.customDiagnosis && data.customDiagnosis.trim().length > 0) {
    return (
      <div className="space-y-5 text-slate-600 text-sm leading-relaxed font-medium whitespace-pre-line">
         {data.customDiagnosis}
      </div>
    );
  }

  const { name, rawScores, originalScores, surveyDetails, weakPoints, subjectLevels } = data;

  // --- K12 DIAGNOSIS ---
  const isHighLevel = Object.values(subjectLevels).some(l => l <= 2);
  const hasHighEnergy = isHighLevel || (surveyDetails.studyDuration && (surveyDetails.studyDuration.includes('2') || surveyDetails.studyDuration.includes('多')));
  const characterKeyword = hasHighEnergy ? "行动力满满" : "沉稳踏实、积蓄能量";
  
  const getSubjectStatus = (subject: string, scoreStr: string) => {
    if (scoreStr && scoreStr !== '0' && scoreStr !== '') {
      return `${subject}${scoreStr}`;
    }
    return null;
  };

  const chineseStatus = getSubjectStatus('语文', originalScores?.chinese || rawScores.chinese.toString());
  const mathStatus = getSubjectStatus('数学', originalScores?.math || rawScores.math.toString());
  const englishStatus = getSubjectStatus('英语', originalScores?.english || rawScores.english.toString());
  
  const statuses = [chineseStatus, mathStatus, englishStatus].filter(Boolean);
  const coordinateText = statuses.length > 0 ? statuses.join('、') : "各科基础情况";
  
  let habitAdvice = "";
  if (surveyDetails.careless && (surveyDetails.careless.includes('经常') || surveyDetails.careless.includes('总是'))) {
    habitAdvice = "老师发现你思维很敏捷，但偶尔会被“马虎”这个小怪兽偷袭。如果我们能把【审题】这个动作放慢 3 秒，圈画出关键词，那些溜走的分数就会乖乖回到卷子上，你会发现自己比想象中更强大！";
  } else if (surveyDetails.mistakes && (surveyDetails.mistakes.includes('不') || surveyDetails.mistakes.includes('偶尔'))) {
    habitAdvice = "错题其实是分数的“金矿”。如果能养成【定期复盘错题】的习惯，把每一个红叉都变成通往高分的台阶，你的进步速度会快得惊人。";
  } else if (surveyDetails.notes && (surveyDetails.notes.includes('不') || surveyDetails.notes.includes('偶尔'))) {
    habitAdvice = "如果能养成【随手记笔记】的习惯，把课堂的精华定格在纸上，复习时你就会发现自己拥有了加速器，知识体系会变得坚不可摧。";
  } else {
    habitAdvice = "试着每天给自己列一个【小目标清单】，完成一项打一个勾，那种“打怪通关”的成就感会让你的学习效率翻倍，也会让你更享受进步的过程。";
  }

  const wpText = weakPoints.length > 0 ? weakPoints.join('、') : "高阶思维拓展与知识体系构建";
  let timeText = surveyDetails.studyDuration ? surveyDetails.studyDuration : "每天一点点时间";
  timeText = timeText.replace(/^[○o0]\s*/, '').trim();
  
  // FIX: Handle "其他" for K12 as well
  if (timeText === '其他' || timeText.includes('其他')) {
      timeText = "一些时间";
  }

  if (timeText.includes('不愿意') || (timeText.includes('不') && timeText.length < 6)) {
     timeText = "一定的时间";
  }

  return (
    <div className="space-y-5 text-slate-600 text-sm leading-relaxed font-medium">
      <p>
        嗨，<strong>{name}</strong>！我是孙老师。看到你认真填写的这份问卷，老师仿佛看到了一个<strong>{characterKeyword}</strong>的你在向我招手。这份诊断书是老师送给你的开学礼物，咱们一起看看未来的进步曲线吧！🚀
      </p>
      <p>
        从目前的学情坐标来看，我们的 <strong>{coordinateText}</strong>。这不仅仅是数字，更是我们向上攀升的基石。在老师眼里，现在的坐标只代表起点，只要调整好“飞行姿态”，你完全具备冲击更高目标的潜能！🌟
      </p>
      <p>
        在学习习惯的“微调”上，孙老师有一个小建议：<strong>{habitAdvice}</strong> 记住，高手之间的差距往往就在这些不起眼的小细节里，稍微优化一下，你就会变得更“无敌”。💪
      </p>
      <p>
        接下来的这段旅程，我们要集中火力攻克几个“必拿分关卡”：重点突围 <strong>{wpText}</strong>。不用担心困难，本方案采用了“精准输入-高频输出”的策略，老师已经把通关秘籍藏在了下面的课程规划里。🎯
      </p>
      <div className="text-slate-800 font-bold bg-indigo-50 p-4 rounded-lg border-l-4 border-indigo-500 mt-4">
        <p>
          最后，我们做一个小小的约定：既然愿意投入 <strong>{timeText}</strong> 来提升自己，那就请严格执行下方的“限时训练法”。相信时间的力量，坚持下去，我们顶峰相见！🌈
        </p>
      </div>
    </div>
  );
};

const ReportTemplate = forwardRef<HTMLDivElement, ReportTemplateProps>(({ data }, ref) => {
  if (!data) return null;

  const validRecommendations = data.recommendations.filter(item => {
    return !item.module.includes('校内上课') && !item.module.includes('上课');
  });

  const groupedBySubject: Record<string, CurriculumItem[]> = { '语文': [], '数学': [], '英语': [], '素养': [], '编程': [], '科学': [] };
  
  validRecommendations.forEach(item => {
    if (groupedBySubject[item.subject]) {
      groupedBySubject[item.subject].push(item);
    } else {
        if (!groupedBySubject[item.subject]) groupedBySubject[item.subject] = [];
        groupedBySubject[item.subject].push(item);
    }
  });

  // Prepare Pages
  type PageType = 
    | { type: 'cover' } 
    | { type: 'checkin-example' }
    | { type: 'subject', subject: string, items: CurriculumItem[], pageIndex: number, totalSubjectPages: number }
    | { type: 'unified-schedule', itemsMap: Record<string, CurriculumItem[]> }
    | { type: 'subject-split', subject: string, items: CurriculumItem[], period: 'weekday' | 'weekend' };

  const pagesToRender: PageType[] = [];

  pagesToRender.push({ type: 'cover' });
  pagesToRender.push({ type: 'checkin-example' });

  // CHECK IF SCHEDULE LAYOUT SHOULD BE USED (K12 Grades 1-9)
  // For iFlyTek users, High School grades ALSO use schedule layout to maintain consistency.
  // UPDATE: XueErSi High School now ALSO uses schedule layout to support "Watch vs Practice" icons and better list flow.
  const isHighSchool = ['高一', '高二', '高三'].includes(data.grade);
  const isIFlyTekHS = data.machineType === 'iflytek' && isHighSchool;
  const isXueErSiHS = data.machineType === 'xueersi' && isHighSchool;
  // const isPreschool = data.studentType === 'preschool'; // REMOVED

  const useScheduleLayout = isIFlyTekHS || isXueErSiHS || [
    '一年级', '二年级', '三年级', '四年级', '五年级', '六年级',
    '初一', '初二', '初三'
  ].includes(data.grade);

  if (useScheduleLayout) {
    // SPLIT PAGE STRATEGY (Requested: 6 Pages for Chinese/Math/English)
    const subjectOrder = isHighSchool 
        ? ['数学', '语文', '英语'] 
        : ['语文', '数学', '英语'];

    subjectOrder.forEach(subject => {
        const items = groupedBySubject[subject] || [];
        if (items.length === 0) return;

        // Split into Weekday / Weekend
        let weekdayItems: CurriculumItem[] = [];
        const weekendItems: CurriculumItem[] = [];
        
        items.forEach(item => {
           const cat = categorizeScheduleItem(item);
           if (cat === 'weekend') weekendItems.push(item);
           else weekdayItems.push(item);
        });

        // Limit Weekday Items (1 Entry, 2 Watch, 4 Practice)
        const entryItems = weekdayItems.filter(i => categorizeScheduleItem(i) === 'entry');
        const watchItems = weekdayItems.filter(i => categorizeScheduleItem(i) === 'watch');
        const practiceItems = weekdayItems.filter(i => categorizeScheduleItem(i) === 'practice');
        
        const sortFn = (a: CurriculumItem, b: CurriculumItem) => {
             if (a.isWeakPointMatch && !b.isWeakPointMatch) return -1;
             if (!a.isWeakPointMatch && b.isWeakPointMatch) return 1;
             return a.originalIndex - b.originalIndex;
        };
        watchItems.sort(sortFn);
        practiceItems.sort(sortFn);

        const limitedWatch = watchItems.slice(0, 2);
        const limitedPractice = practiceItems.slice(0, 4);
        
        // Construct Weekday List: Entry -> Watch -> Practice
        weekdayItems = [...entryItems, ...limitedWatch, ...limitedPractice];
        weekdayItems.sort((a, b) => {
           const catA = categorizeScheduleItem(a);
           const catB = categorizeScheduleItem(b);
           
           // Entry always first
           if (catA === 'entry' && catB !== 'entry') return -1;
           if (catA !== 'entry' && catB === 'entry') return 1;

           // Watch before Practice
           if (catA === 'watch' && catB !== 'watch') return -1;
           if (catA !== 'watch' && catB === 'watch') return 1;
           
           return a.originalIndex - b.originalIndex;
        });

        // Sort Weekend Items: New AI Features First
        weekendItems.sort((a, b) => {
            // New items first (using originalIndex which is set to negative for new items)
            if (a.isNew && !b.isNew) return -1;
            if (!a.isNew && b.isNew) return 1;
            return a.originalIndex - b.originalIndex;
        });

        // Push Weekday Page
        if (weekdayItems.length > 0) {
            pagesToRender.push({
                type: 'subject-split',
                subject,
                items: weekdayItems,
                period: 'weekday'
            });
        }

        // Push Weekend Page
        if (weekendItems.length > 0) {
            pagesToRender.push({
                type: 'subject-split',
                subject,
                items: weekendItems,
                period: 'weekend'
            });
        }
    });

    // Handle other subjects (Literacy, etc.) - Append as standard pages if needed
    // For now, we strictly follow the 3-subject split request.
  } else {
    // STANDARD/PAGINATED STRATEGY (Legacy/Fallback):
    ['语文', '数学', '英语', '素养'].forEach(subject => {
      const items = groupedBySubject[subject];
      if (items && items.length > 0) {
        const dynamicPages = paginateItems(items);
        dynamicPages.forEach((chunk, idx) => {
          pagesToRender.push({
            type: 'subject',
            subject: subject,
            items: chunk,
            pageIndex: idx + 1,
            totalSubjectPages: dynamicPages.length
          });
        });
      }
    });
  }

  const totalPages = pagesToRender.length;

  // Module Config for Styling
  const moduleConfigList = [
    { key: '预习', icon: <BookOpen size={16} />, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-100' },
    { key: '看课', icon: <MonitorPlay size={16} />, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-100' }, 
    { key: '练习', icon: <PenTool size={16} />, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
    { key: '练题', icon: <Pencil size={16} />, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' }, 
    { key: '复习', icon: <RotateCcw size={16} />, color: 'text-teal-600', bg: 'bg-teal-50', border: 'border-teal-100' },
    { key: '拓展', icon: <Rocket size={16} />, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100' },
    { key: '周末', icon: <Sun size={16} />, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100' }, 
    { key: '思维', icon: <Monitor size={16} />, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
    { key: '逻辑', icon: <Rocket size={16} />, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100' },
    { key: '外教', icon: <Monitor size={16} />, color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-100' },
    { key: '分级', icon: <BookOpen size={16} />, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
    { key: '拼音', icon: <PenTool size={16} />, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
    { key: '科普', icon: <Monitor size={16} />, color: 'text-cyan-600', bg: 'bg-cyan-50', border: 'border-cyan-100' },
    { key: '益智', icon: <Rocket size={16} />, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-100' },
    { key: '文化', icon: <BookOpen size={16} />, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100' },
    { key: '运动', icon: <Rocket size={16} />, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-100' },
    { key: '故事', icon: <BookOpen size={16} />, color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-100' },
  ];

  const getModuleStyle = (moduleName: string) => {
    const exact = moduleConfigList.find(m => m.key === moduleName);
    if (exact) return exact;
    const fuzzy = moduleConfigList.find(m => moduleName.includes(m.key));
    if (fuzzy) return fuzzy;
    return { 
        key: moduleName, 
        icon: <CheckCircle2 size={16} />, 
        color: 'text-slate-600', 
        bg: 'bg-slate-50', 
        border: 'border-slate-200' 
    };
  };

// ... existing code ...
  const themes: Record<string, any> = {
    '语文': { headerBg: 'bg-emerald-600', title: '语文', subtitle: 'CHINESE', iconBg: 'bg-emerald-500' },
    '数学': { headerBg: 'bg-teal-600', title: '数学', subtitle: 'MATHEMATICS', iconBg: 'bg-teal-500' },
    '英语': { headerBg: 'bg-cyan-600', title: '英语', subtitle: 'ENGLISH', iconBg: 'bg-cyan-500' },
    '素养': { headerBg: 'bg-lime-600', title: '素养', subtitle: 'LITERACY', iconBg: 'bg-lime-500' },
    '拓展': { headerBg: 'bg-green-600', title: '拓展', subtitle: 'EXTENSION', iconBg: 'bg-green-500' },
    '编程': { headerBg: 'bg-sky-600', title: '编程', subtitle: 'PROGRAMMING', iconBg: 'bg-sky-500' },
    '科学': { headerBg: 'bg-teal-700', title: '科学', subtitle: 'SCIENCE', iconBg: 'bg-teal-600' },
  };

  const PageFooter = ({ pageNum }: { pageNum: number }) => (
    <div className="absolute bottom-0 left-0 w-full h-14 border-t border-emerald-50 flex items-center justify-between px-12 text-emerald-800/40 bg-white z-20">
      <div className="flex items-center gap-2">
        <CheckCircle2 size={14} className="text-emerald-200" />
        <span className="text-xs font-bold tracking-[0.2em] uppercase text-emerald-200">BeiQing Spring Camp 2026</span>
      </div>
      <div className="text-xs font-mono text-emerald-200">
        PAGE {pageNum} <span className="mx-1">/</span> {totalPages}
      </div>
    </div>
  );

  // Common Card Render Function
  const renderItemCard = (item: CurriculumItem, i: number, showIconLabel: boolean = false) => {
      const { tags, cleanText } = parseObjective(item.objective);
      // Disable 'Priority' badge for Preschool students
      const isHighPriority = item.difficulty >= 2;
      const modConfig = getModuleStyle(item.module);
      const category = categorizeScheduleItem(item); // 'watch', 'practice', 'weekend'

      // Clean module label for internal card
      let badgeLabel = item.module;
      if (useScheduleLayout) {
         badgeLabel = category === 'entry' ? '录入' : category === 'watch' ? '看课' : category === 'practice' ? '练题' : '拓展';
      }

      return (
        <div 
           key={i} 
           className={`relative p-6 rounded-2xl border transition-all flex gap-5
             ${isHighPriority 
               ? 'bg-orange-50/60 border-orange-100' 
               : 'bg-white border-emerald-50 shadow-sm'}
           `}
        >
           {/* NEW Badge - UPDATED STYLE */}
           {item.isNew && (
             <div className="absolute -top-3 -right-3 z-20">
                <div className="relative flex items-center justify-center">
                   <Star size={48} className="text-rose-500 fill-rose-500 drop-shadow-lg" />
                   <span className="absolute text-[11px] font-black text-white tracking-tighter transform -rotate-12 pb-1 pr-0.5">NEW</span>
                </div>
             </div>
           )}

           {/* Left: Icon Badge (for Schedule Layout inner distinction) */}
           {showIconLabel && (
             <div className="shrink-0 flex flex-col items-center gap-3 pt-2 w-16 border-r border-dashed border-emerald-100 pr-5">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${modConfig.bg} ${modConfig.color} border ${modConfig.border}`}>
                   {category === 'entry' ? <Camera size={18}/> : category === 'watch' ? <MonitorPlay size={18}/> : category === 'practice' ? <Pencil size={18}/> : <Rocket size={18}/>}
                </div>
                <span className={`text-sm font-bold ${modConfig.color}`}>{badgeLabel}</span>
             </div>
           )}

           <div className="flex-1 min-w-0">
               {/* Header */}
               <div className="flex justify-between items-start gap-3 mb-3">
                 <div className="font-bold text-slate-800 text-xl leading-tight flex-1 flex items-baseline">
                   <span className="mr-3 text-emerald-600 font-bold opacity-80 shrink-0 text-lg">{i + 1}.</span>
                   <span className="font-serif tracking-wide">{cleanProjectName(item.project)}</span>
                 </div>
                 
                 {isHighPriority && (
                    <div className="text-orange-600 text-xs font-extrabold flex items-center gap-1 bg-orange-100/50 px-3 py-1 rounded-full shrink-0">
                      <AlertCircle size={14} className="stroke-[2.5]" /> 
                      <span>重点</span>
                    </div>
                 )}
               </div>

               {/* Body */}
               <div className="text-slate-600 text-base mb-3">
                 <div className="flex flex-wrap items-baseline gap-2 mb-2">
                   <span className="text-emerald-400 font-bold text-xs uppercase tracking-wider shrink-0">目标</span>
                   {tags.map((tag, tIdx) => (
                     <span key={tIdx} className="text-teal-700 font-bold text-sm bg-teal-50 px-2 py-0.5 rounded-md border border-teal-100">
                       {tag}
                     </span>
                   ))}
                 </div>
                 <div className="leading-relaxed text-slate-600 pl-0">
                    {cleanText}
                 </div>
               </div>

               {/* Footer: Path */}
               {item.path && (
                 <div className="flex items-center gap-2 pt-3 border-t border-dashed border-emerald-50 mt-2">
                    <Monitor size={14} className="text-emerald-400 shrink-0" />
                    {/* UPDATED: Removed truncate, added pill style for better visibility of long paths */}
                    <span className="text-sm text-slate-500 font-medium bg-slate-50 px-3 py-1.5 rounded-lg break-all leading-tight">
                      {item.path}
                    </span>
                 </div>
               )}
           </div>
        </div>
      );
  };

  return (
    <div ref={ref} className="bg-gray-100 p-8">
      {pagesToRender.map((page, globalIndex) => {
        const pageNum = globalIndex + 1;

        // --- RENDER COVER ---
        if (page.type === 'cover') {
            return (
                <div key={`page-${pageNum}`} className="report-page w-[794px] h-[1123px] bg-white relative shadow-2xl mx-auto mb-10 flex flex-col overflow-hidden font-sans">
                   {/* Header Section - Spring Theme (Reduced Height) */}
                   <div className="bg-gradient-to-br from-teal-900 via-emerald-900 to-green-900 text-white h-[220px] relative px-12 py-8 flex flex-col justify-between shrink-0 overflow-hidden">
                      {/* Abstract Shapes - Spring Vibe */}
                      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-emerald-400/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4"></div>
                      <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-cyan-400/10 rounded-full blur-3xl translate-y-1/3 -translate-x-1/4"></div>
                      <div className="absolute top-10 left-10 w-20 h-20 bg-yellow-300/10 rounded-full blur-xl"></div>

                      <div className="relative z-10">
                        <div className="flex items-center gap-3 text-emerald-300 mb-2">
                          <span className="px-2 py-0.5 bg-white/10 rounded-full text-xs font-bold tracking-[0.2em] uppercase flex items-center gap-2 backdrop-blur-sm border border-white/10">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                            2026 Spring Edition
                          </span>
                        </div>
                        <h1 className="text-[22px] font-extrabold tracking-tight mb-1 leading-tight font-serif">
                          🌱 {data.name} 的专属《北清领学营》春季方案 🚀
                        </h1>
                      </div>

                      <div className="relative z-10 flex justify-between items-end border-t border-white/10 pt-2">
                         <div>
                           <div className="text-emerald-200/60 text-[10px] uppercase tracking-wider mb-0.5">Student Name</div>
                           {/* Updated Name & Badge Layout */}
                           <div className="flex items-center gap-4 pb-0.5">
                              <div className="text-xl font-bold leading-none font-serif">{data.name}</div>
                              {/* Machine/Grade Badge in Header - Pure Text Mode */}
                              <div className="flex items-center gap-2 pt-0.5 opacity-90">
                                <MonitorSmartphone size={14} className="text-emerald-300" />
                                <span className="text-xs font-medium text-white tracking-wide">
                                  {data.machineType === 'iflytek' ? '科大讯飞' : data.machineType === 'bubugao' ? '步步高' : '学而思'} · {data.grade}
                                </span>
                              </div>
                           </div>
                         </div>
                         <div className="flex flex-col items-end gap-0.5">
                            <div className="text-emerald-200/60 text-[10px] uppercase tracking-wider">Generated Date</div>
                            <div className="font-mono text-xs text-emerald-100">{new Date().toLocaleDateString()}</div>
                         </div>
                      </div>
                   </div>

                   {/* Cover Body: Diagnosis (Adjusted Padding) */}
                   <div className="flex-1 px-10 py-6 flex flex-col justify-start relative bg-gradient-to-b from-white to-emerald-50/30 overflow-hidden">
                      <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-50/50 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                      
                      <div className="relative z-10 space-y-4 h-full flex flex-col">
                         
                         {/* NEW: Welcome Message - EMPHASIZED & LARGER */}
                         <div className="bg-gradient-to-r from-emerald-50 to-teal-50 p-6 rounded-2xl border-2 border-emerald-100 shadow-md shrink-0">
                            <h3 className="text-emerald-800 font-extrabold text-2xl mb-3 flex items-center gap-2 border-b border-emerald-200/50 pb-2">
                               <span className="text-3xl">🌿</span> 2026 春季全新启航
                            </h3>
                            <div className="space-y-2">
                                <p className="text-emerald-900 text-lg leading-relaxed font-black">
                                   欢迎加入 2026 年北清领学营春季班！
                                </p>
                                <p className="text-emerald-900/90 text-base leading-relaxed text-justify font-bold">
                                   今年，我们的学习机迎来了<strong className="text-teal-800 bg-teal-200/50 px-2 py-0.5 rounded mx-1 text-lg">重大版本更新</strong>，融入了更多前沿的 AI 智能辅导功能。老师们已经将这些“黑科技”深度融合到了这份专属学习方案中。
                                </p>
                                <p className="text-emerald-900/90 text-base leading-relaxed text-justify font-bold">
                                   无论是精准的<strong>AI错题诊断</strong>，还是个性化的<strong>智能推题</strong>，都将在这份方案中为您呈现。请带上这份方案，充分利用 2026 年的新功能，跟我们一起高效学习，在春天里拔节生长！
                                </p>
                            </div>
                         </div>

                         {/* Diagnosis Text - Allow expansion */}
                         <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-xl shadow-emerald-100/20 relative flex-1 overflow-hidden flex flex-col">
                            <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500"></div>
                            <h3 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2 shrink-0">
                               <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                               孙老师寄语
                            </h3>
                            <div className="text-base overflow-y-auto pr-2 custom-scrollbar">
                                {generateDiagnosisText(data)}
                            </div>
                         </div>
                      </div>
                   </div>

                   <PageFooter pageNum={pageNum} />
                </div>
            );
        }


        // --- RENDER CHECKIN EXAMPLE PAGE ---
        if (page.type === 'checkin-example') {
            // Static Data for "Standard Answer" (1.5 Hours Daily)
            
            const weekdayList = [
                { task: '1. 语文-听写/背诵', time: '10分钟' },
                { task: '2. 语文-校内作业录入', time: '5分钟' },
                { task: '3. 语文-同步练', time: '15分钟' },
                { task: '4. 数学-校内作业录入', time: '5分钟' },
                { task: '5. 数学-AI专属练', time: '10分钟' },
                { task: '6. 数学-AI精准学', time: '15分钟' },
                { task: '7. 英语-天天背单词', time: '10分钟' },
                { task: '8. 英语-校内作业录入', time: '5分钟' },
                { task: '9. 英语-同步练', time: '15分钟' },
            ];

            const saturdayList = [
                { task: '1. 语文-错题练', time: '15分钟' },
                { task: '2. 语文-AI作文体系学', time: '25分钟' },
                { task: '3. 数学-重难点提分课', time: '25分钟' },
                { task: '4. 数学-错题练', time: '15分钟' },
                { task: '5. 英语-AI口语分级练', time: '20分钟' },
                { task: '6. 英语-分级阅读', time: '20分钟' },
            ];

            const sundayList = [
                { task: '1. 语文-重难点提分课', time: '25分钟' },
                { task: '2. 语文-趣味分级练', time: '15分钟' },
                { task: '3. 数学-校内同步课(预习)', time: '25分钟' },
                { task: '4. 数学-同步练', time: '15分钟' },
                { task: '5. 英语-错题练', time: '15分钟' },
                { task: '6. 英语-重难点提分课', time: '25分钟' },
            ];

            // Prepare Sections
            const sections = [
                { header: '周一到周五', tasks: weekdayList },
                { header: '周六', tasks: saturdayList },
                { header: '周日', tasks: sundayList },
            ];

            return (
                <div key={`page-${pageNum}`} className="report-page w-[794px] h-[1123px] bg-[#4a8ad4] p-3 mx-auto mb-10 flex flex-col font-sans shadow-2xl">
                   
                   {/* Notebook Container */}
                   <div className="relative bg-[#fdfdfd] rounded-md flex-1 flex overflow-hidden">
                        
                        {/* Left Binding Area */}
                        <div className="w-12 bg-[#fdfdfd] flex flex-col items-center pt-8 space-y-8 flex-shrink-0 border-r border-dashed border-gray-300 relative z-10">
                            {[...Array(10)].map((_, i) => (
                                <div key={i} className="w-5 h-5 rounded-full bg-gradient-to-br from-gray-200 to-gray-400 shadow-inner ring-1 ring-gray-400/50"></div>
                            ))}
                        </div>

                        {/* Right Content Area */}
                        <div className="flex-1 bg-grid-paper p-6 relative flex flex-col">
                            
                            {/* Header */}
                            <div className="flex flex-col items-center justify-center mb-4">
                                <div className="relative mb-2">
                                    <div className="absolute -bottom-2 left-0 right-0 h-3 bg-orange-300/50 -rotate-1 rounded-full transform scale-x-110"></div>
                                    <h1 className="text-3xl font-black text-[#4a8ad4] tracking-wide relative z-10 font-sans">
                                        限时训练法-打卡 (示例)
                                    </h1>
                                </div>
                                <div className="flex items-baseline gap-2 mt-1 border-b-2 border-gray-300 px-4 pb-1">
                                    <span className="text-xl font-bold text-gray-600">北清领学营·专属方案</span>
                                    <span className="text-base font-medium text-[#4a8ad4]">(周一到周五：每天学习1.5小时 / 周六周日：每天学习2小时)</span>
                                </div>
                            </div>

                            {/* Table */}
                            <div className="border-2 border-[#5b9bd5] rounded-lg overflow-hidden bg-white mt-2">
                                <table className="w-full text-sm border-collapse">
                                    <thead>
                                        <tr className="bg-[#5b9bd5] text-white">
                                            <th className="py-2 px-4 text-center font-bold text-base w-[50%] border-r border-white/30">作业任务</th>
                                            <th className="py-2 px-2 text-center font-bold text-base w-[15%] border-r border-white/30">预估时长</th>
                                            <th className="py-2 px-2 text-center font-bold text-base w-[20%] border-r border-white/30">开始结束时间</th>
                                            <th className="py-2 px-2 text-center font-bold text-base w-[15%]">完成情况</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sections.map((section, secIndex) => (
                                            <React.Fragment key={secIndex}>
                                                {/* Section Header */}
                                                <tr className="bg-blue-50/80 border-b border-[#5b9bd5]/30">
                                                    <td colSpan={4} className="py-2 px-4 text-[#4a8ad4] font-extrabold text-base text-left border-l-4 border-l-[#4a8ad4]">
                                                        {section.header}
                                                    </td>
                                                </tr>
                                                {/* Tasks */}
                                                {section.tasks.map((task, taskIndex) => (
                                                    <tr key={`${secIndex}-${taskIndex}`} className="border-b border-[#5b9bd5]/30 hover:bg-gray-50 min-h-[36px]">
                                                        <td className="py-2 px-4 text-gray-700 font-medium border-r border-[#5b9bd5]/30 pl-8 relative tracking-wide align-middle">
                                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-[#5b9bd5] rounded-full"></span>
                                                            {task.task}
                                                        </td>
                                                        <td className="py-2 px-2 text-center text-gray-600 border-r border-[#5b9bd5]/30 font-medium align-middle">
                                                            {task.time}
                                                        </td>
                                                        <td className="py-2 px-2 border-r border-[#5b9bd5]/30"></td>
                                                        <td className="py-2 px-2"></td>
                                                    </tr>
                                                ))}
                                            </React.Fragment>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                   </div>

                   <PageFooter pageNum={pageNum} />
                </div>
            );
        }


        // --- RENDER SPLIT SUBJECT PAGE (New 6-Page Layout) ---
        if (page.type === 'subject-split') {
            const { subject, items, period } = page;
            const subjTheme = themes[subject as keyof typeof themes] || themes['语文'];
            
            const isWeekday = period === 'weekday';
            const periodTitle = isWeekday ? '周一至周五 · 核心学习' : '周末 · 拓展提升';
            const periodSubtitle = isWeekday ? 'Daily Routine' : 'Weekend Extension';
            
            // Theme colors for the container
            const containerBorder = isWeekday ? 'border-emerald-100' : 'border-amber-100';
            const headerBg = isWeekday ? 'bg-emerald-50/50' : 'bg-amber-50/50';
            const headerBorder = isWeekday ? 'border-emerald-100' : 'border-amber-100';
            const titleColor = isWeekday ? 'text-emerald-900' : 'text-amber-900';
            const subtitleColor = isWeekday ? 'text-emerald-400' : 'text-amber-400';
            const iconColor = isWeekday ? 'text-emerald-600' : 'text-amber-600';

            return (
              <div key={`page-${pageNum}`} className="report-page w-[794px] min-h-[1123px] h-auto bg-white relative shadow-2xl mx-auto mb-10 flex flex-col pb-20 font-sans">
                 {/* Subject Header */}
                 <div className={`${subjTheme.headerBg} h-24 relative overflow-hidden flex items-center justify-between px-10 shrink-0`}>
                    <div className="text-white relative z-10">
                       <h2 className="text-3xl font-extrabold flex items-center gap-3">
                          {subjTheme.title}：推荐您使用的学习机功能如下 <span className="text-white/40 text-sm font-normal tracking-widest uppercase mt-2">{subjTheme.subtitle}</span>
                       </h2>
                    </div>
                    <div className={`w-12 h-12 ${subjTheme.iconBg} rounded-xl flex items-center justify-center text-white/90 shadow-lg`}>
                       <Star size={24} fill="currentColor" />
                    </div>
                 </div>

                 {/* Content */}
                 <div className="p-10 bg-slate-50/30 flex flex-col gap-8 flex-1">
                     <div className={`flex flex-col bg-white rounded-3xl border ${containerBorder} shadow-sm overflow-hidden min-h-[800px]`}>
                        <div className={`${headerBg} px-8 py-5 border-b ${headerBorder} flex items-center gap-3`}>
                           {isWeekday ? <CalendarDays size={24} className={iconColor} /> : <Coffee size={24} className={iconColor} />}
                           <h3 className={`font-bold text-xl ${titleColor}`}>{periodTitle}</h3>
                           <span className={`text-sm font-medium ml-auto ${subtitleColor}`}>{periodSubtitle}</span>
                        </div>
                        <div className="p-6 grid grid-cols-1 gap-5">
                           {items.map((item, i) => renderItemCard(item, i, true))}
                        </div>
                     </div>
                 </div>

                 <PageFooter pageNum={pageNum} />
              </div>
            );
        }

        // --- RENDER STANDARD SUBJECT PAGE (Pagination) ---
        if (page.type === 'subject') {
          const theme = themes[page.subject as keyof typeof themes] || themes['语文'];
          return (
            <div key={`page-${pageNum}`} className="report-page w-[794px] h-[1123px] bg-white relative shadow-2xl mx-auto mb-10 flex flex-col overflow-hidden">
               {/* Header */}
               <div className={`${theme.headerBg} h-24 relative overflow-hidden flex items-center justify-between px-10 shrink-0`}>
                   <div className="text-white relative z-10">
                      <h2 className="text-3xl font-extrabold flex items-center gap-3">
                         {theme.title} <span className="text-white/40 text-sm font-normal tracking-widest uppercase mt-2">{theme.subtitle}</span>
                      </h2>
                   </div>
                   <div className={`w-12 h-12 ${theme.iconBg} rounded-xl flex items-center justify-center text-white/90 shadow-lg`}>
                      <Star size={24} fill="currentColor" />
                   </div>
               </div>
               
               {/* Body */}
               <div className="flex-1 p-10 bg-slate-50/30">
                  <div className="grid grid-cols-1 gap-4">
                     {page.items.map((item, i) => renderItemCard(item, i))}
                  </div>
               </div>

               <PageFooter pageNum={pageNum} />
            </div>
          );
        }

        return null;
      })}
    </div>
  );
});

export default ReportTemplate;
