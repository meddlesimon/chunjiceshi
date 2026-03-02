
import React, { useState, useMemo } from 'react';
import { StudentProcessedData, CurriculumItem } from '../types';
import { X, Save, Trash2, Plus, Search, FileDown } from 'lucide-react';
import { getAllCurriculumItems } from '../services/dataProcessor';

interface StudentEditorProps {
  student: StudentProcessedData;
  onSave: (updatedStudent: StudentProcessedData) => void;
  onCancel: () => void;
  onGenerateSinglePDF: (student: StudentProcessedData) => void;
  isGenerating: boolean;
}

const StudentEditor: React.FC<StudentEditorProps> = ({ student, onSave, onCancel, onGenerateSinglePDF, isGenerating }) => {
  // State for the student being edited (Deep Copy)
  const [editedStudent, setEditedStudent] = useState<StudentProcessedData>(JSON.parse(JSON.stringify(student)));
  
  // State for "Add Course" modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedSubjectToAdd, setSelectedSubjectToAdd] = useState<string>('语文');
  const [searchTerm, setSearchTerm] = useState('');

  // 1. Diagnosis Editing
  const handleDiagnosisChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditedStudent(prev => ({
      ...prev,
      customDiagnosis: e.target.value
    }));
  };

  // 2. Remove Course
  const handleRemoveCourse = (indexToRemove: number) => {
    setEditedStudent(prev => ({
      ...prev,
      recommendations: prev.recommendations.filter((_, idx) => idx !== indexToRemove)
    }));
  };

  // 3. Add Course Logic
  // LOAD CURRICULUM BASED ON STUDENT MACHINE TYPE AND GRADE
  const allCurriculum = useMemo(() => {
    return getAllCurriculumItems(student.machineType, student.grade);
  }, [student.machineType, student.grade]);
  
  // Filter available courses for the "Add" modal
  const availableCourses = useMemo(() => {
    return allCurriculum.filter(item => {
      // Must match subject
      if (item.subject !== selectedSubjectToAdd) return false;
      
      // Filter by search term
      if (searchTerm) {
        const lowerSearch = searchTerm.toLowerCase();
        return (
          item.project.toLowerCase().includes(lowerSearch) || 
          item.module.toLowerCase().includes(lowerSearch) ||
          item.objective.toLowerCase().includes(lowerSearch)
        );
      }
      return true;
    });
  }, [allCurriculum, selectedSubjectToAdd, searchTerm]);

  const handleAddCourse = (course: CurriculumItem) => {
    setEditedStudent(prev => ({
      ...prev,
      recommendations: [...prev.recommendations, course].sort((a, b) => a.originalIndex - b.originalIndex)
    }));
    setIsAddModalOpen(false);
  };

  const handleSave = () => {
    onSave(editedStudent);
  };

  const handleGeneratePDF = () => {
    onGenerateSinglePDF(editedStudent);
  };

  const subjects = ['语文', '数学', '英语'];
  
  const machineLabel = editedStudent.machineType === 'iflytek' ? '科大讯飞' : editedStudent.machineType === 'bubugao' ? '步步高' : '学而思';
  
  const getMachineStyle = () => {
      if (editedStudent.machineType === 'iflytek') return 'bg-blue-100 text-blue-700';
      if (editedStudent.machineType === 'bubugao') return 'bg-emerald-100 text-emerald-700';
      return 'bg-orange-100 text-orange-700';
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-5xl h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <div>
             <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
               编辑档案: {editedStudent.name}
             </h2>
             <p className="text-xs text-gray-400 mt-1">专属课程方案定制</p>
          </div>
          <div className="flex gap-2">
            <button onClick={onCancel} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
              <X size={20} className="text-gray-500" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-8 bg-gray-50/50">
           
            {/* Meta Info Bar */}
            <div className="flex items-center gap-4 text-xs text-gray-500 bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                <div className="flex gap-1">
                  <span className="font-bold text-gray-700">年级:</span> 
                  <span>{editedStudent.grade}</span>
                </div>
                <div className="w-px h-3 bg-gray-300"></div>
                <div className="flex gap-1 items-center">
                  <span className="font-bold text-gray-700">学习设备:</span> 
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${getMachineStyle()}`}>
                    {machineLabel}
                  </span>
                </div>
                <div className="w-px h-3 bg-gray-300"></div>
                <div className="flex gap-1">
                  <span className="font-bold text-gray-700">导入时间:</span> 
                  <span>{new Date(editedStudent.uploadTimestamp).toLocaleDateString()}</span>
                </div>
            </div>

            {/* Section 1: Diagnosis / Parent Feedback */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2">
                  <span className="w-1 h-4 bg-indigo-500 rounded-full"></span>
                  孙老师诊断建议
                </h3>
                <textarea 
                  className="w-full h-40 p-4 border border-gray-300 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none leading-relaxed"
                  placeholder="在此处输入自定义的诊断建议，这将覆盖系统自动生成的文本..."
                  value={editedStudent.customDiagnosis || ''}
                  onChange={handleDiagnosisChange}
                />
            </div>

            {/* Section 2: Course List */}
            <div className="space-y-6">
                {subjects.map(subject => {
                  const subjectCourses = editedStudent.recommendations.filter(c => c.subject === subject);
                  let themeColor = 'text-gray-600 bg-gray-50 border-gray-100';
                  
                  if (subject === '语文') themeColor = 'text-emerald-600 bg-emerald-50 border-emerald-100';
                  else if (subject === '数学') themeColor = 'text-blue-600 bg-blue-50 border-blue-100';
                  else if (subject === '英语') themeColor = 'text-rose-600 bg-rose-50 border-rose-100';
                  else if (subject === '编程') themeColor = 'text-cyan-600 bg-cyan-50 border-cyan-100';
                  else if (subject === '科学') themeColor = 'text-indigo-600 bg-indigo-50 border-indigo-100';
                  else if (subject === '素养') themeColor = 'text-amber-600 bg-amber-50 border-amber-100';
                  else if (subject === '拓展') themeColor = 'text-purple-600 bg-purple-50 border-purple-100';

                  return (
                    <div key={subject} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                        <div className="flex justify-between items-center mb-4">
                          <h3 className={`font-bold px-3 py-1 rounded-lg border text-sm ${themeColor}`}>
                            {subject} ({subjectCourses.length} 课程)
                          </h3>
                          <button 
                            onClick={() => {
                              setSelectedSubjectToAdd(subject);
                              setSearchTerm('');
                              setIsAddModalOpen(true);
                            }}
                            className="text-xs flex items-center gap-1 font-bold text-gray-500 hover:text-indigo-600 transition-colors bg-gray-100 hover:bg-indigo-50 px-3 py-1.5 rounded-full"
                          >
                            <Plus size={14} /> 添加{subject}课程
                          </button>
                        </div>

                        {subjectCourses.length === 0 ? (
                          <div className="text-center py-8 text-gray-400 text-sm bg-gray-50 rounded-lg border border-dashed">
                            暂无推荐课程
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 gap-3">
                            {subjectCourses.map((course, idx) => {
                              const realIndex = editedStudent.recommendations.indexOf(course);
                              return (
                                <div key={idx} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100 group hover:border-indigo-200 hover:shadow-sm transition-all">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 mb-1">
                                          <span className="text-xs font-bold text-gray-400">[{course.module}]</span>
                                          <span className="text-sm font-bold text-gray-800">{course.project}</span>
                                          {(course.difficulty >= 2) && (
                                            <span className="text-[10px] text-rose-600 bg-rose-50 px-1.5 rounded border border-rose-100">重点</span>
                                          )}
                                      </div>
                                      <div className="text-xs text-gray-500 line-clamp-1">{course.objective}</div>
                                    </div>
                                    <button 
                                      onClick={() => handleRemoveCourse(realIndex)}
                                      className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                      title="删除课程"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                    </div>
                  );
                })}
            </div>

        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
           <button 
             onClick={handleGeneratePDF}
             disabled={isGenerating}
             className={`flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-bold shadow-sm transition-all
               ${isGenerating ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'hover:bg-gray-50'}
             `}
           >
             {isGenerating ? (
               <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-indigo-600"></div>
             ) : (
               <FileDown size={16} /> 
             )}
             {isGenerating ? '生成中...' : '下载预览 PDF'}
           </button>

           <div className="flex gap-3">
             <button 
               onClick={onCancel}
               className="px-6 py-2 text-gray-500 font-medium text-sm hover:text-gray-800"
             >
               取消
             </button>
             <button 
               onClick={handleSave}
               className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg text-sm hover:bg-indigo-700 shadow-md flex items-center gap-2"
             >
               <Save size={16} /> 保存修改
             </button>
           </div>
        </div>

        {/* --- Nested Modal: Add Course --- */}
        {isAddModalOpen && (
           <div className="absolute inset-0 z-[60] bg-black/20 backdrop-blur-sm flex items-center justify-center p-8">
              <div className="bg-white w-full max-w-2xl h-[80vh] rounded-xl shadow-2xl flex flex-col border border-gray-200">
                 <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
                    <h3 className="font-bold text-gray-800">
                       添加 {selectedSubjectToAdd} 课程 
                       <span className="ml-2 text-xs font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                         库来源: {machineLabel}
                       </span>
                    </h3>
                    <button onClick={() => setIsAddModalOpen(false)}><X size={20} className="text-gray-400 hover:text-gray-600"/></button>
                 </div>
                 
                 <div className="p-4 border-b border-gray-100">
                    <div className="relative">
                       <Search size={16} className="absolute left-3 top-3 text-gray-400"/>
                       <input 
                         type="text" 
                         placeholder="搜索课程名称、目标..." 
                         className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                         value={searchTerm}
                         onChange={(e) => setSearchTerm(e.target.value)}
                         autoFocus
                       />
                    </div>
                 </div>

                 <div className="flex-1 overflow-y-auto p-2">
                    {availableCourses.length === 0 ? (
                       <div className="text-center py-10 text-gray-400 text-sm">没有找到匹配的课程</div>
                    ) : (
                       <div className="space-y-1">
                          {availableCourses.map((item, i) => {
                             // Check if already added
                             const isAdded = editedStudent.recommendations.some(r => r.project === item.project && r.module === item.module);

                             return (
                               <button 
                                 key={i}
                                 onClick={() => !isAdded && handleAddCourse(item)}
                                 disabled={isAdded}
                                 className={`w-full text-left p-3 rounded-lg border transition-all flex items-center justify-between group
                                    ${isAdded ? 'bg-gray-50 border-gray-100 opacity-50 cursor-not-allowed' : 'bg-white border-gray-100 hover:border-indigo-300 hover:shadow-md'}
                                 `}
                               >
                                  <div>
                                     <div className="text-sm font-bold text-gray-800 mb-0.5">
                                        <span className="text-gray-400 font-normal mr-2">[{item.module}]</span>
                                        {item.project}
                                     </div>
                                     <div className="text-xs text-gray-400 line-clamp-1">{item.objective}</div>
                                  </div>
                                  {!isAdded && <Plus size={16} className="text-indigo-500 opacity-0 group-hover:opacity-100" />}
                                  {isAdded && <span className="text-xs text-gray-400">已添加</span>}
                               </button>
                             );
                          })}
                       </div>
                    )}
                 </div>
              </div>
           </div>
        )}

      </div>
    </div>
  );
};

export default StudentEditor;
