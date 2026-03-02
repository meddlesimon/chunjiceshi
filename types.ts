
export interface StudentRawData {
  student_name: string;
  grade: string;
  math_score: string;
  chinese_score: string;
  english_score: string;
  // Ranking fields
  math_rank?: string;
  chinese_rank?: string;
  english_rank?: string;
  
  weak_points: string;
  study_duration: string; 
  // Qualitative fields for diagnosis
  careless_habit?: string; // Q15 马虎
  note_habit?: string;     // Q12 笔记
  plan_habit?: string;     // Q16 计划
  mistake_habit?: string;  // Q11 错题
  
  // New: Machine Brand
  machine_brand?: string;
  
  // New: Submission Time from CSV
  submit_time?: string;

  // --- STRICT SURVEY TYPE FLAGS ---
  // If true, this row came from the K12 survey (asked for scores)
  is_k12_survey?: boolean;
}

// 1 = Top (Top 5%), 5 = Bottom
export type SubjectLevel = 1 | 2 | 3 | 4 | 5;

export type MachineType = 'xueersi' | 'iflytek' | 'bubugao';

export type StudentType = 'k12'; // k12 = Primary/Middle/High

export interface CurriculumItem {
  subject: string;
  module: string;
  project: string;
  difficulty: number;
  objective: string;
  path: string;
  applicableGrades: string[]; 
  isWeakPointMatch?: boolean; 
  originalIndex: number;
  classType?: string; 
  isExtension?: boolean; 
  isNew?: boolean;
}

export interface StudentProcessedData {
  id: string;
  name: string;
  grade: string; // Current grade from CSV
  uploadTimestamp: number;
  csvIndex: number; // Original row index from CSV
  submitTime: number; // Parsed submission time for sorting
  
  // New: Track which machine/curriculum is used
  machineType: MachineType;
  // New: Track if student is K12 or Preschool
  studentType: StudentType;

  // Numerical scores for logic/level calculation
  rawScores: {
    math: number;
    chinese: number;
    english: number;
  };
  // Text representation for display (e.g. "90分~100分")
  originalScores: {
    math: string;
    chinese: string;
    english: string;
  };

  ranks: {
    math: string;
    chinese: string;
    english: string;
  };
  subjectLevels: {
    math: SubjectLevel;
    chinese: SubjectLevel;
    english: SubjectLevel;
  };
  weakPoints: string[];
  
  // The core output
  recommendations: CurriculumItem[];
  
  // Qualitative data
  surveyDetails: {
    careless: string;
    notes: string;
    planning: string;
    mistakes: string;
    studyDuration: string;
  };
  
  // Manual override for diagnosis text
  customDiagnosis?: string;
}

export interface ProcessingStatus {
  total: number;
  current: number;
  isProcessing: boolean;
  isComplete: boolean;
  logs: string[];
}
