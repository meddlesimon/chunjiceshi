
import Papa from 'papaparse';
import { StudentRawData, StudentProcessedData, SubjectLevel, CurriculumItem, MachineType, StudentType } from '../types';
import { 
  CURRICULUM_XUEERSI_CSV, 
  CURRICULUM_IFLYTEK_PRIMARY_LOW_CSV,
  CURRICULUM_IFLYTEK_PRIMARY_HIGH_CSV,
  CURRICULUM_IFLYTEK_MIDDLE_CSV,
  CURRICULUM_IFLYTEK_HIGH_CSV,
  CURRICULUM_XES_HIGH_CSV, // New High School Import
} from '../constants';

const CURRICULUM_HIGHSCHOOL_CSV = `适用年级,科目,时间,模块,难度,项目,学习目标,路径位置
高中通用,语文,周一至周五,基础巩固,1,高中语文基础,巩固基础知识,学习机-高中-语文
高中通用,数学,周一至周五,基础巩固,1,高中数学基础,巩固基础知识,学习机-高中-数学
高中通用,英语,周一至周五,基础巩固,1,高中英语基础,巩固基础知识,学习机-高中-英语`;

// --- 1. Grade Normalization & Logic ---

const normalizeGrade = (inputGrade: string): string => {
  if (!inputGrade) return '通用';
  const str = inputGrade.trim();
  
  // High School
  if (str.includes('高一') || str.includes('10年级') || str.match(/High\s*1/i)) return '高一';
  if (str.includes('高二') || str.includes('11年级') || str.match(/High\s*2/i)) return '高二';
  if (str.includes('高三') || str.includes('12年级') || str.match(/High\s*3/i)) return '高三';

  // Middle School
  if (str.includes('初一') || str.includes('七年级') || str.includes('7年级') || str.match(/Grade\s*7/i) || str.match(/Junior\s*1/i)) return '初一';
  if (str.includes('初二') || str.includes('八年级') || str.includes('8年级') || str.match(/Grade\s*8/i) || str.match(/Junior\s*2/i)) return '初二';
  if (str.includes('初三') || str.includes('九年级') || str.includes('9年级') || str.match(/Grade\s*9/i) || str.match(/Junior\s*3/i)) return '初三';

  // Primary School
  if (str.includes('一年级') || str.includes('1年级') || str.includes('小一') || str.match(/Grade\s*1\b/i)) return '一年级';
  if (str.includes('二年级') || str.includes('2年级') || str.includes('小二') || str.match(/Grade\s*2/i)) return '二年级';
  if (str.includes('三年级') || str.includes('3年级') || str.includes('小三') || str.match(/Grade\s*3/i)) return '三年级';
  if (str.includes('四年级') || str.includes('4年级') || str.includes('小四') || str.match(/Grade\s*4/i)) return '四年级';
  if (str.includes('五年级') || str.includes('5年级') || str.includes('小五') || str.match(/Grade\s*5/i)) return '五年级';
  if (str.includes('六年级') || str.includes('6年级') || str.includes('小六') || str.match(/Grade\s*6/i)) return '六年级';

  return '通用'; 
};

// Caching DBs
let cachedXueErSiCurriculum: CurriculumItem[] | null = null;
let cachedHighSchoolCurriculum: CurriculumItem[] | null = null;
let cachedXesHigh: CurriculumItem[] | null = null; // New Cache for XES High School

// iFlyTek Caches
let cachedIFlyTekPrimaryLow: CurriculumItem[] | null = null;
let cachedIFlyTekPrimaryHigh: CurriculumItem[] | null = null;
let cachedIFlyTekMiddle: CurriculumItem[] | null = null;
let cachedIFlyTekHigh: CurriculumItem[] | null = null;

const parseCurriculumCSV = (csvContent: string): CurriculumItem[] => {
  const results = Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true,
  });

  const rawRows = results.data as any[];
  const processedRows: CurriculumItem[] = [];

  let lastSubject = '';
  let lastModule = '';

  rawRows.forEach((row, index) => {
    // Skip instructional rows like "此行以上..."
    if (!row['科目'] && !lastSubject) return; 

    let currentSubject = row['科目'] ? row['科目'].trim() : '';
    
    // Logic for inheriting subject if empty, or cleaning newlines
    if (currentSubject !== '') {
        currentSubject = currentSubject.replace(/\n/g, ' ').trim();
        lastSubject = currentSubject;
    }

    // Handle Module Key:
    let timeVal = row['时间'] ? row['时间'].trim() : '';
    let moduleVal = row['模块'] || row['主题'];
    
    // Fallback for Bubugao: It doesn't have 'module', so use '启蒙' as default module
    if (!moduleVal && !row['模块'] && !row['主题']) {
        moduleVal = '启蒙';
    }

    if (moduleVal && typeof moduleVal === 'string') {
        moduleVal = moduleVal.trim();
    }

    // Combine Time + Module if both exist to match legacy logic "周一至周五 看课"
    // Also ensures keywords like "周末" are preserved for categorization
    let fullModuleString = moduleVal;
    if (timeVal && moduleVal && !moduleVal.includes(timeVal)) {
        fullModuleString = `${timeVal} ${moduleVal}`;
    }

    if (fullModuleString && fullModuleString.trim() !== '') {
      lastModule = fullModuleString.trim();
    }

    // Parse Difficulty: Handle both numbers and Star ratings (⭐️)
    const diffStr = row['难度'] ? row['难度'].toString().trim() : '';
    let difficulty = 1; // Default to 1 if missing
    if (diffStr.includes('⭐️') || diffStr.includes('⭐')) {
        difficulty = (diffStr.match(/[⭐️⭐]/g) || []).length;
    } else if (diffStr) {
        difficulty = parseInt(diffStr);
    }
    
    // Grade handling (Generic)
    let rawGrades = row['适用年级'] || row['年级'] || '通用';
    if (typeof rawGrades === 'string') rawGrades = rawGrades.trim();
    if (rawGrades === '') rawGrades = '通用';
    
    const applicableGrades = rawGrades.split(/[,，、\s和]+/).map((g: string) => g.trim());

    // Map '课程名' (Preschool/Bubugao) to '项目' (K12) if needed
    const projectName = row['项目'] || row['课程名'] || '';
    // Map '课程简介' (Preschool/Bubugao) to '学习目标' (K12) if needed
    const objective = row['学习目标'] || row['课程简介'] || '';
    
    // Extract Class Type (A/B) for Preschool (Legacy)
    const classType = row['班型'] ? row['班型'].trim() : undefined;

    // Detect Extension
    const isExtension = lastSubject.includes('拓展');
    let finalSubject = lastSubject;
    
    // Simple subject normalization for XES Preschool new CSVs
    if (lastSubject.includes('语文')) finalSubject = '语文';
    else if (lastSubject.includes('数学')) finalSubject = '数学';
    else if (lastSubject.includes('英语')) finalSubject = '英语';
    else if (lastSubject.includes('拓展')) finalSubject = '拓展';

    if (lastSubject) {
      processedRows.push({
        subject: finalSubject,
        module: lastModule || '基础',
        project: projectName,
        difficulty: difficulty, 
        objective: objective,
        path: row['路径位置'] || '',
        applicableGrades: applicableGrades,
        originalIndex: index,
        classType: classType,
        isExtension: isExtension
      });
    }
  });

  return processedRows;
};

// Get specific DB based on type and grade
export const loadAllCurriculumDBs = () => {
    if (!cachedHighSchoolCurriculum) cachedHighSchoolCurriculum = parseCurriculumCSV(CURRICULUM_HIGHSCHOOL_CSV);
    if (!cachedXueErSiCurriculum) cachedXueErSiCurriculum = parseCurriculumCSV(CURRICULUM_XUEERSI_CSV);
    
    // Load iFlyTek K12 Caches
    if (!cachedIFlyTekPrimaryLow) cachedIFlyTekPrimaryLow = parseCurriculumCSV(CURRICULUM_IFLYTEK_PRIMARY_LOW_CSV);
    if (!cachedIFlyTekPrimaryHigh) cachedIFlyTekPrimaryHigh = parseCurriculumCSV(CURRICULUM_IFLYTEK_PRIMARY_HIGH_CSV);
    if (!cachedIFlyTekMiddle) cachedIFlyTekMiddle = parseCurriculumCSV(CURRICULUM_IFLYTEK_MIDDLE_CSV);
    if (!cachedIFlyTekHigh) cachedIFlyTekHigh = parseCurriculumCSV(CURRICULUM_IFLYTEK_HIGH_CSV);

    // Load XueErSi High School Cache (New)
    if (!cachedXesHigh) cachedXesHigh = parseCurriculumCSV(CURRICULUM_XES_HIGH_CSV);
};

// --- 2. Subject Level Logic ---

const determineSubjectLevel = (score: number, rankStr: string): SubjectLevel => {
  if (rankStr) {
    if (rankStr.includes('前25%') && !rankStr.includes('50%')) return 1; 
    if (rankStr.includes('25%~50%') || rankStr.includes('25%-50%')) return 2; 
    if (rankStr.includes('50%~75%') || rankStr.includes('50%-75%')) return 3; 
    if (rankStr.includes('后25%')) return 4; 
    if (rankStr.includes('不清楚')) return 3; 
  }

  if (score > 0) {
    if (score >= 90) return 1;
    if (score >= 80) return 2;
    if (score >= 70) return 3;
    return 4;
  }

  return 3; 
};

// --- 3. Matching Algorithm ---

const getModuleKey = (moduleName: string) => {
  // Support mixed keys like "周一至周五 看课"
  if (moduleName.includes('预习')) return '预习';
  if (moduleName.includes('练习')) return '练习';
  if (moduleName.includes('练题')) return '练习'; 
  if (moduleName.includes('复习')) return '复习';
  if (moduleName.includes('拓展')) return '拓展';
  if (moduleName.includes('周末')) return '拓展';
  if (moduleName.includes('看课')) return '预习'; 
  
  return '其他';
};

const generateRecommendations = (
  subjectLevels: { math: SubjectLevel, chinese: SubjectLevel, english: SubjectLevel }, 
  weakPoints: string[], 
  curriculum: CurriculumItem[],
  studentGrade: string,
  machineType: MachineType
): CurriculumItem[] => {
  
  const normalizedGrade = normalizeGrade(studentGrade);
  const isHighSchool = ['高一', '高二', '高三'].includes(normalizedGrade);
  
  const isK12ScheduleMode = [
    '一年级', '二年级', '三年级', '四年级', '五年级', '六年级',
    '初一', '初二', '初三'
  ].includes(normalizedGrade);
  
  const isIFlyTekHighSchool = machineType === 'iflytek' && isHighSchool;
  const isXueErSiHighSchool = machineType === 'xueersi' && isHighSchool; // Flag for XES High School

  // --- K12 LOGIC (Grades 1-9 + High School) ---
  const getQuotasForLevel = (level: SubjectLevel) => {
    if (isK12ScheduleMode || isIFlyTekHighSchool || isXueErSiHighSchool) {
       return { '预习': 20, '练习': 20, '复习': 20, '拓展': 20, '其他': 20 };
    }
    if (isHighSchool) {
        return { '预习': 20, '练习': 20, '复习': 20, '拓展': 20, '其他': 20 };
    }
    switch (level) {
      case 1: return { '预习': 3, '练习': 2, '复习': 2, '拓展': 4, '其他': 10 };
      case 2: return { '预习': 4, '练习': 3, '复习': 2, '拓展': 3, '其他': 10 };
      case 3: return { '预习': 4, '练习': 4, '复习': 2, '拓展': 1, '其他': 10 };
      case 4: return { '预习': 5, '练习': 4, '复习': 3, '拓展': 0, '其他': 10 };
      default: return { '预习': 4, '练习': 4, '复习': 2, '拓展': 1, '其他': 10 };
    }
  };

  const getMaxDifficulty = (level: SubjectLevel) => {
    if (isHighSchool) return 10;
    if (level === 1 || level === 2) return 3; 
    if (level === 3) return 2; 
    return 1; 
  };

  const subjects = ['语文', '数学', '英语'];
  const subjectKeys = { '语文': 'chinese', '数学': 'math', '英语': 'english' } as const;

  let finalRecommendations: CurriculumItem[] = [];

  subjects.forEach(subject => {
    const sKey = subjectKeys[subject as keyof typeof subjectKeys];
    const level = subjectLevels[sKey];
    
    const quotas = getQuotasForLevel(level);
    const maxDiff = getMaxDifficulty(level);
    
    // ... (rest of logic) ...

    let candidates = curriculum.filter(item => {
      if (item.subject !== subject) return false;
      if (item.difficulty > maxDiff) return false;
      
      // Strict XES High School DB Logic:
      if (isXueErSiHighSchool) {
         return item.applicableGrades.some(g => g === '高中' || g === '通用' || g.includes('高中'));
      }

      const isGradeMatch = item.applicableGrades.includes('通用') || item.applicableGrades.includes(normalizedGrade);
      if (!isGradeMatch) return false;
      return true;
    });

    // ... (weak point matching) ...
    candidates = candidates.map(item => ({
      ...item,
      isWeakPointMatch: weakPoints.some(wp => 
        item.project.includes(wp) || item.module.includes(wp)
      )
    }));

    const moduleGroups: Record<string, CurriculumItem[]> = {
      '预习': [], '练习': [], '复习': [], '拓展': [], '其他': []
    };

    candidates.forEach(item => {
      const key = getModuleKey(item.module);
      if (moduleGroups[key]) moduleGroups[key].push(item);
    });

    let subjectItems: CurriculumItem[] = [];

    Object.keys(moduleGroups).forEach(modKey => {
      let items = moduleGroups[modKey];
      
      items.sort((a, b) => {
        if (a.isWeakPointMatch && !b.isWeakPointMatch) return -1;
        if (!a.isWeakPointMatch && b.isWeakPointMatch) return 1;
        
        if (!isHighSchool && !isK12ScheduleMode && !isIFlyTekHighSchool && level >= 3) {
           if (a.difficulty !== b.difficulty) return a.difficulty - b.difficulty;
        }

        return a.originalIndex - b.originalIndex;
      });

      const limit = quotas[modKey as keyof typeof quotas] || 99;
      const selectedItems = items.slice(0, limit);
      selectedItems.sort((a, b) => a.originalIndex - b.originalIndex);
      subjectItems = [...subjectItems, ...selectedItems];
    });

    // --- INJECT NEW FEATURES (XueErSi Only) ---
    if (machineType === 'xueersi') {
        // 1. ENTRY (All Subjects, Weekday, Top Priority)
        const entryItem: CurriculumItem = {
            subject: subject,
            module: '录入', // Changed from '基础' to '录入' to match categorization
            project: '校内作业录入',
            difficulty: 1,
            objective: '使用全科批改或智慧眼功能，拍照录入每日校内作业与试卷。系统将自动记录学情并生成个性化错题本，精准定位薄弱点，考前高效复习，免去手抄错题之苦。【必做】【5分钟】',
            path: '全科批改 / 智慧眼',
            applicableGrades: ['通用'],
            originalIndex: -1000, // Force absolute top
            isNew: true
        };
        // Insert at beginning
        subjectItems.unshift(entryItem);

        // 2. AI EXCLUSIVE PRACTICE (Math Only, Weekday, 2nd Priority)
        if (subject === '数学') {
            const aiPracticeItem: CurriculumItem = {
                subject: '数学',
                module: '练习', // Maps to Weekday
                project: 'AI 专属练',
                difficulty: 1,
                objective: '这是学习机根据你每天使用的数据，帮你推荐的你最需要提升的 10 道题。每天只需练习 10 道题，就可以非常好地进行巩固和训练。【必做】【15分钟】',
                path: '王牌练习-AI 专属练-数学',
                applicableGrades: ['通用'],
                originalIndex: -900, // After Entry (-1000) but before others
                isNew: true
            };
            // Insert at index 1 (after Entry)
            subjectItems.splice(1, 0, aiPracticeItem);
        }

        // 3. AI ESSAY GUIDANCE (Chinese Only, Weekend, Top Priority)
        if (subject === '语文') {
            const aiEssayItem: CurriculumItem = {
                subject: '语文',
                module: '周末拓展', // Maps to Weekend
                project: 'AI 作文体系学',
                difficulty: 1,
                objective: '使用的功能是AI 作文引导和 AI 作文批改，能够用 AI 算法一步步启发、引导你拓展写作思路，并优化、润色你的写作内容。【必做】【25分钟】',
                path: '语文-专项提升-作文体系学',
                applicableGrades: ['通用'],
                originalIndex: -2000, // Force top of Weekend
                isNew: true
            };
            subjectItems.push(aiEssayItem);
        }

        // 4. AI ORAL COACH (English Only, Weekend, Top Priority)
        if (subject === '英语') {
             const aiOralItem: CurriculumItem = {
                subject: '英语',
                module: '周末拓展', // Maps to Weekend
                project: 'AI 口语分级练',
                difficulty: 1,
                objective: '用 AI 大模型生成的口语陪练教练，带你一起聊一聊中小学常用的一些热门话题，不断提升你的口语表达，教你用更地道的语言。【必做】【20分钟】',
                path: 'AI 老师-AI 专属一对一-AI 口语分级练',
                applicableGrades: ['通用'],
                originalIndex: -2000, // Force top of Weekend
                isNew: true
            };
            subjectItems.push(aiOralItem);
        }
    }

    finalRecommendations = [...finalRecommendations, ...subjectItems];
  });

  return finalRecommendations;
};

// Retrieve all available items for manual adding in Editor
export const getAllCurriculumItems = (machineType: MachineType, grade: string): CurriculumItem[] => {
  loadAllCurriculumDBs();

  const normalizedGrade = normalizeGrade(grade);
  const isHighSchool = ['高一', '高二', '高三'].includes(normalizedGrade);
  
  if (machineType === 'iflytek') {
      if (['一年级', '二年级', '三年级'].includes(normalizedGrade)) return cachedIFlyTekPrimaryLow || [];
      if (['四年级', '五年级', '六年级'].includes(normalizedGrade)) return cachedIFlyTekPrimaryHigh || [];
      if (['初一', '初二', '初三'].includes(normalizedGrade)) return cachedIFlyTekMiddle || [];
      if (['高一', '高二', '高三'].includes(normalizedGrade)) return cachedIFlyTekHigh || [];
      return cachedIFlyTekMiddle || [];
  }

  if (isHighSchool) {
      // If XueErSi High School, return the specific new DB
      if (machineType === 'xueersi') {
          return cachedXesHigh || [];
      }
      return cachedXueErSiCurriculum || cachedHighSchoolCurriculum || [];
  }

  return cachedXueErSiCurriculum || [];
};

// --- 4. Survey Format Mapping Helpers ---

const mapScoreToNumber = (val: string): number => {
  if (!val) return 0;
  if (val.includes('不清楚') || val.includes('没学') || val.includes('未开')) {
      return 75; 
  }
  const directNum = parseFloat(val);
  if (!isNaN(directNum) && val.match(/^\d+(\.\d+)?$/)) {
      return directNum;
  }
  if (val.includes('90分~100分') || val.includes('90-100')) return 95;
  if (val.includes('80分~89分') || val.includes('80-89')) return 85;
  if (val.includes('70分~79分') || val.includes('70-79')) return 75;
  if (val.includes('60分~69分') || val.includes('60-69')) return 65;
  if (val.includes('60分以下')) return 55;
  return directNum || 75; 
};

const parseSubmissionTime = (timeStr: string | undefined): number => {
  if (!timeStr) return 0;
  let cleanStr = timeStr.trim();
  let ts = Date.parse(cleanStr);
  if (!isNaN(ts)) return ts;
  let standardStr = cleanStr
      .replace(/年/g, '/')
      .replace(/月/g, '/')
      .replace(/日/g, ' ')
      .replace(/时/g, ':')
      .replace(/分/g, '')
      .replace(/秒/g, '');
  ts = Date.parse(standardStr);
  if (!isNaN(ts)) return ts;
  if (cleanStr.includes('.')) {
    let dotStr = cleanStr.replace(/\./g, '/');
    ts = Date.parse(dotStr);
    if (!isNaN(ts)) return ts;
  }
  return 0;
};

const cleanSurveyString = (str: string): string => {
  if (!str) return '';
  let cleaned = str.replace(/^[A-Z0-9][\.\、]?\s*/i, '');
  cleaned = cleaned.split(/[（(]/)[0];
  return cleaned.trim();
};

const processSurveyRow = (row: any): StudentRawData => {
  const keys = Object.keys(row);
  const nameKey = keys.find(k => k.includes('请输入孩子的姓名') || k.includes('孩子的名字') || k.includes('学生姓名') || k.includes('名字'));
  const gradeKey = keys.find(k => k.includes('您的孩子现在是几年级') || k.includes('孩子的年级') || k.includes('年级'));
  const chineseScoreKey = keys.find(k => k.includes('在校语文成绩') || (k.includes('语文') && k.includes('成绩')));
  const mathScoreKey = keys.find(k => k.includes('在校数学成绩') || (k.includes('数学') && k.includes('成绩')));
  const englishScoreKey = keys.find(k => k.includes('在校英语成绩') || (k.includes('英语') && k.includes('成绩')));
  const isK12Survey = !!chineseScoreKey; 
  const chineseRankKey = keys.find(k => k.includes('语文') && k.includes('排名'));
  const mathRankKey = keys.find(k => k.includes('数学') && k.includes('排名'));
  const englishRankKey = keys.find(k => k.includes('英语') && k.includes('排名'));
  const pactKey = keys.find(k => k.includes('限时训练法'));
  const willingnessKey = keys.find(k => (k.includes('愿意') || k.includes('投入') || k.includes('额外')) && (k.includes('时间') || k.includes('时长') || k.includes('分钟')));
  const studyKey = keys.find(k => (k.includes('课外') || k.includes('使用学习机')) && (k.includes('时间') || k.includes('时长')) && !k.includes('作业'));
  const timeKey = pactKey || willingnessKey || studyKey;
  const carelessKey = keys.find(k => k.includes('马虎') || k.includes('粗心'));
  const notesKey = keys.find(k => k.includes('笔记'));
  const planKey = keys.find(k => k.includes('计划'));
  const mistakeKey = keys.find(k => k.includes('错题'));
  const machineKey = keys.find(k => k.includes('您的学习机品牌') || k.includes('学习机品牌') || k.includes('品牌') || k.includes('设备'));
  const submitTimeKey = keys.find(k => k.includes('答题结束时间') || k.includes('结束答题时间') || k.includes('提交时间') || k.includes('结束时间') || k.includes('答题时间') || k.includes('填写日期') || k.includes('日期'));
  const weakPoints = keys.filter(k => k.includes('最想提升') && row[k]).map(k => cleanSurveyString(row[k])).filter(Boolean).join(',');
  
  let processedDuration = '';
  if (timeKey && row[timeKey]) {
      let raw = row[timeKey];
      raw = raw.replace(/^[A-Z0-9○o]\.?[\s\、]?\s*/, '').trim();
      processedDuration = raw;
  }
  return {
    student_name: nameKey ? row[nameKey] : '未命名',
    grade: gradeKey ? cleanSurveyString(row[gradeKey]) : '未知年级',
    math_score: mathScoreKey ? cleanSurveyString(row[mathScoreKey]) : '',
    chinese_score: chineseScoreKey ? cleanSurveyString(row[chineseScoreKey]) : '',
    english_score: englishScoreKey ? cleanSurveyString(row[englishScoreKey]) : '',
    math_rank: mathRankKey ? row[mathRankKey] : '',
    chinese_rank: chineseRankKey ? row[chineseRankKey] : '',
    english_rank: englishRankKey ? row[englishRankKey] : '',
    weak_points: weakPoints,
    study_duration: processedDuration,
    careless_habit: carelessKey ? row[carelessKey] : '',
    note_habit: notesKey ? row[notesKey] : '',
    plan_habit: planKey ? row[planKey] : '',
    mistake_habit: mistakeKey ? row[mistakeKey] : '',
    machine_brand: machineKey ? row[machineKey] : '',
    submit_time: submitTimeKey ? row[submitTimeKey] : '',
    is_k12_survey: isK12Survey
  };
};

const detectMachineType = (brandStr: string | undefined): MachineType => {
  if (!brandStr) return 'xueersi'; 
  const str = brandStr.toLowerCase();
  if (str.includes('讯飞') || str.includes('iflytek') || str.includes('科大')) return 'iflytek';
  if (str.includes('步步高') || str.includes('bubugao')) return 'bubugao';
  return 'xueersi';
};

export const parseAndProcessCSV = (file: File): Promise<StudentProcessedData[]> => {
  loadAllCurriculumDBs();
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy', 
      complete: (results) => {
        try {
          const rawData = results.data as any[];
          if (rawData.length === 0) { resolve([]); return; }
          const firstRow = rawData[0];
          const keys = Object.keys(firstRow);
          const surveyNameKey = keys.find(k => k.includes('请输入孩子的姓名') || k.includes('孩子的名字') || k.includes('学生姓名') || k.includes('名字'));
          const simpleNameKey = 'student_name'; 
          const isSurveyFormat = !!surveyNameKey;
          const nameKey = isSurveyFormat ? surveyNameKey : simpleNameKey;
          const validData = rawData.filter(row => {
            if (nameKey && Object.prototype.hasOwnProperty.call(row, nameKey)) {
               const val = row[nameKey];
               return val && typeof val === 'string' && val.trim().length > 0;
            }
            return Object.values(row).some(v => v && typeof v === 'string' && v.trim().length > 0);
          });

          const processed: StudentProcessedData[] = validData.map((row, index) => {
            let standardizedRow: StudentRawData;
            if (isSurveyFormat) {
              standardizedRow = processSurveyRow(row);
            } else {
              standardizedRow = row as StudentRawData;
              if (!standardizedRow.study_duration) standardizedRow.study_duration = '';
            }

            const machineType = detectMachineType(standardizedRow.machine_brand);
            const rawGradeStr = standardizedRow.grade || '未知年级';
            const normalizedGrade = normalizeGrade(rawGradeStr);
            const isHighSchool = ['高一', '高二', '高三'].includes(normalizedGrade);
            const finalStudentType: StudentType = 'k12';

            // --- CURRICULUM SELECTION (STRICT ROUTING) ---
            let activeCurriculum;
            
            // K12 Logic
            if (machineType === 'iflytek') {
                if (['一年级', '二年级', '三年级'].includes(normalizedGrade)) activeCurriculum = cachedIFlyTekPrimaryLow || [];
                else if (['四年级', '五年级', '六年级'].includes(normalizedGrade)) activeCurriculum = cachedIFlyTekPrimaryHigh || [];
                else if (['初一', '初二', '初三'].includes(normalizedGrade)) activeCurriculum = cachedIFlyTekMiddle || [];
                else if (['高一', '高二', '高三'].includes(normalizedGrade)) activeCurriculum = cachedIFlyTekHigh || [];
                else activeCurriculum = cachedIFlyTekMiddle || [];
            } else {
                // XueErSi K12
                if (isHighSchool) {
                   // NEW: Use specific XueErSi High School Curriculum
                   // This handles Grade 10-12 specifically
                   activeCurriculum = cachedXesHigh || [];
                } else {
                   activeCurriculum = cachedXueErSiCurriculum || [];
                }
            }

            const mathScore = mapScoreToNumber(standardizedRow.math_score);
            const chineseScore = mapScoreToNumber(standardizedRow.chinese_score);
            const englishScore = mapScoreToNumber(standardizedRow.english_score);
            const submitTime = parseSubmissionTime(standardizedRow.submit_time);
            const weakPoints = standardizedRow.weak_points ? standardizedRow.weak_points.split(/[,，]/).map(s => s.trim()).filter(Boolean) : [];
            const subjectLevels = {
              math: determineSubjectLevel(mathScore, standardizedRow.math_rank || ''),
              chinese: determineSubjectLevel(chineseScore, standardizedRow.chinese_rank || ''),
              english: determineSubjectLevel(englishScore, standardizedRow.english_rank || '')
            };
            
            const studentRecommendations = generateRecommendations(
              subjectLevels, 
              weakPoints, 
              activeCurriculum || [], 
              rawGradeStr,
              machineType
            );

            return {
              id: `student-${index}-${Date.now()}`,
              name: standardizedRow.student_name || '未命名',
              grade: normalizedGrade, 
              uploadTimestamp: Date.now(),
              csvIndex: index,
              submitTime: submitTime, 
              machineType: machineType,
              studentType: finalStudentType, 
              rawScores: { math: mathScore, chinese: chineseScore, english: englishScore },
              originalScores: {
                 math: standardizedRow.math_score || '',
                 chinese: standardizedRow.chinese_score || '',
                 english: standardizedRow.english_score || ''
              },
              ranks: {
                math: standardizedRow.math_rank || '',
                chinese: standardizedRow.chinese_rank || '',
                english: standardizedRow.english_rank || ''
              },
              subjectLevels: subjectLevels,
              weakPoints: weakPoints,
              recommendations: studentRecommendations,
              surveyDetails: {
                careless: standardizedRow.careless_habit || '',
                notes: standardizedRow.note_habit || '',
                planning: standardizedRow.plan_habit || '',
                mistakes: standardizedRow.mistake_habit || '',
                studyDuration: standardizedRow.study_duration
              }
            };
          });
          resolve(processed);
        } catch (e) {
          reject(e);
        }
      },
      error: (error) => {
        reject(error);
      }
    });
  });
};
