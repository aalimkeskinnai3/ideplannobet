import React, { useState, useEffect } from 'react';
import { Shield, Users, Calendar, MapPin, RotateCcw, Save, Download, AlertTriangle, CheckCircle } from 'lucide-react';
import { Teacher, EDUCATION_LEVELS } from '../types';
import { DutyArea, DutySlot, DutySchedule, DUTY_AREAS, DUTY_DAYS, getCurrentWeek, getWeekDates, formatWeekRange, calculateTeacherDutyLoad } from '../types/duty';
import { useFirestore } from '../hooks/useFirestore';
import { useDutyFirestore } from '../hooks/useDutyFirestore';
import { useToast } from '../hooks/useToast';
import { useConfirmation } from '../hooks/useConfirmation';
import Button from '../components/UI/Button';
import Select from '../components/UI/Select';
import Modal from '../components/UI/Modal';
import ConfirmationModal from '../components/UI/ConfirmationModal';

const DutyManagement = () => {
  const { data: teachers } = useFirestore<Teacher>('teachers');
  const { data: dutyAreas, add: addDutyArea } = useDutyFirestore<DutyArea>('dutyAreas');
  const { data: dutySlots, add: addDutySlot, remove: removeDutySlot, bulkAdd: bulkAddDutySlots } = useDutyFirestore<DutySlot>('dutySlots');
  const { data: dutySchedules, add: addDutySchedule, update: updateDutySchedule } = useDutyFirestore<DutySchedule>('dutySchedules');
  
  const { success, error, warning, info } = useToast();
  const { 
    confirmation, 
    hideConfirmation, 
    confirmReset
  } = useConfirmation();

  const [selectedWeek, setSelectedWeek] = useState(getCurrentWeek());
  const [currentSchedule, setCurrentSchedule] = useState<DutySchedule['schedule']>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [selectedTeacherStats, setSelectedTeacherStats] = useState<string>('');

  // Initialize duty areas if not exists
  useEffect(() => {
    if (dutyAreas.length === 0) {
      DUTY_AREAS.forEach(async (area) => {
        await addDutyArea(area);
      });
    }
  }, [dutyAreas.length, addDutyArea]);

  // Load existing schedule for selected week
  useEffect(() => {
    const existingSchedule = dutySchedules.find(s => 
      s.week === selectedWeek.week && s.year === selectedWeek.year
    );
    
    if (existingSchedule) {
      setCurrentSchedule(existingSchedule.schedule);
    } else {
      // Initialize empty schedule
      const emptySchedule: DutySchedule['schedule'] = {};
      DUTY_DAYS.forEach(day => {
        emptySchedule[day] = {};
        dutyAreas.forEach(area => {
          emptySchedule[day][area.id] = [];
        });
      });
      setCurrentSchedule(emptySchedule);
    }
    setHasUnsavedChanges(false);
  }, [selectedWeek, dutySchedules, dutyAreas]);

  // Track unsaved changes
  useEffect(() => {
    const hasAssignments = Object.values(currentSchedule).some(day =>
      Object.values(day).some(assignments => assignments.length > 0)
    );
    setHasUnsavedChanges(hasAssignments);
  }, [currentSchedule]);

  const sortedTeachers = [...teachers].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  const sortedAreas = [...dutyAreas].sort((a, b) => a.priority - b.priority);

  const weekOptions = [];
  for (let i = -2; i <= 10; i++) {
    const current = getCurrentWeek();
    const week = current.week + i;
    const year = current.year;
    weekOptions.push({
      value: `${week}-${year}`,
      label: `${week}. Hafta (${formatWeekRange(week, year)})`
    });
  }

  const getTeacherDutyCount = (teacherId: string): number => {
    return Object.values(currentSchedule).reduce((total, day) =>
      total + Object.values(day).reduce((dayTotal, assignments) =>
        dayTotal + (assignments.includes(teacherId) ? 1 : 0), 0
      ), 0
    );
  };

  const getAreaAssignments = (day: string, areaId: string): string[] => {
    return currentSchedule[day]?.[areaId] || [];
  };

  const assignTeacherToDuty = (day: string, areaId: string, teacherId: string) => {
    const area = dutyAreas.find(a => a.id === areaId);
    if (!area) return;

    const currentAssignments = getAreaAssignments(day, areaId);
    
    // Check if teacher is already assigned
    if (currentAssignments.includes(teacherId)) {
      warning('⚠️ Zaten Atanmış', 'Bu öğretmen bu nöbet alanına zaten atanmış');
      return;
    }

    // Check capacity
    if (currentAssignments.length >= area.capacity) {
      warning('⚠️ Kapasite Dolu', `${area.name} alanı için maksimum kapasite (${area.capacity}) dolmuş`);
      return;
    }

    // Check if teacher already has 2 duties this week
    const teacherWeeklyDuties = getTeacherDutyCount(teacherId);
    if (teacherWeeklyDuties >= 2) {
      warning('⚠️ Haftalık Limit', 'Bu öğretmen bu hafta zaten 2 nöbet görevi almış');
      return;
    }

    // Check if teacher has duty on the same day in another area
    const dayAssignments = Object.values(currentSchedule[day] || {}).flat();
    if (dayAssignments.includes(teacherId)) {
      warning('⚠️ Günlük Çakışma', 'Bu öğretmen aynı gün başka bir alanda nöbet tutuyor');
      return;
    }

    // Assign teacher
    setCurrentSchedule(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        [areaId]: [...currentAssignments, teacherId]
      }
    }));

    const teacher = teachers.find(t => t.id === teacherId);
    success('✅ Nöbet Atandı', `${teacher?.name} ${day} günü ${area.name} alanına atandı`);
  };

  const removeTeacherFromDuty = (day: string, areaId: string, teacherId: string) => {
    const currentAssignments = getAreaAssignments(day, areaId);
    const newAssignments = currentAssignments.filter(id => id !== teacherId);

    setCurrentSchedule(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        [areaId]: newAssignments
      }
    }));

    const teacher = teachers.find(t => t.id === teacherId);
    const area = dutyAreas.find(a => a.id === areaId);
    success('🗑️ Nöbet Kaldırıldı', `${teacher?.name} ${day} günü ${area?.name} alanından kaldırıldı`);
  };

  const generateAutomaticSchedule = async () => {
    setIsGenerating(true);
    
    try {
      // Reset current schedule
      const newSchedule: DutySchedule['schedule'] = {};
      DUTY_DAYS.forEach(day => {
        newSchedule[day] = {};
        dutyAreas.forEach(area => {
          newSchedule[day][area.id] = [];
        });
      });

      // Get teacher duty statistics
      const teacherStats = teachers.map(teacher => 
        calculateTeacherDutyLoad(teacher.id, dutySlots, selectedWeek.week, selectedWeek.year)
      );

      // Sort teachers by duty load (ascending) and randomize within same load
      const availableTeachers = [...teachers]
        .map(teacher => ({
          ...teacher,
          stats: teacherStats.find(s => s.teacherId === teacher.id)!,
          weeklyDuties: 0 // Track duties assigned this week
        }))
        .sort((a, b) => {
          if (a.stats.totalDuties !== b.stats.totalDuties) {
            return a.stats.totalDuties - b.stats.totalDuties;
          }
          return Math.random() - 0.5; // Randomize within same load
        });

      // Assign duties day by day, area by area
      for (const day of DUTY_DAYS) {
        for (const area of sortedAreas) {
          const neededTeachers = area.capacity;
          let assigned = 0;

          for (const teacher of availableTeachers) {
            if (assigned >= neededTeachers) break;
            
            // Check constraints
            if (teacher.weeklyDuties >= 2) continue; // Max 2 duties per week
            
            // Check if teacher already has duty this day
            const dayAssignments = Object.values(newSchedule[day]).flat();
            if (dayAssignments.includes(teacher.id)) continue;

            // Assign teacher
            newSchedule[day][area.id].push(teacher.id);
            teacher.weeklyDuties++;
            assigned++;
          }

          if (assigned < neededTeachers) {
            warning('⚠️ Eksik Atama', `${area.name} alanı için ${day} günü yeterli öğretmen atanamadı`);
          }
        }
      }

      setCurrentSchedule(newSchedule);
      success('🤖 Otomatik Program Oluşturuldu', 'Nöbet programı otomatik olarak oluşturuldu');
      
    } catch (err) {
      error('❌ Oluşturma Hatası', 'Otomatik program oluşturulurken hata oluştu');
    } finally {
      setIsGenerating(false);
    }
  };

  const saveSchedule = async () => {
    try {
      const existingSchedule = dutySchedules.find(s => 
        s.week === selectedWeek.week && s.year === selectedWeek.year
      );

      const scheduleData = {
        week: selectedWeek.week,
        year: selectedWeek.year,
        schedule: currentSchedule
      };

      if (existingSchedule) {
        await updateDutySchedule(existingSchedule.id, scheduleData);
      } else {
        await addDutySchedule(scheduleData);
      }

      // Save individual duty slots for statistics
      const dutySlotData: Omit<DutySlot, 'id' | 'createdAt'>[] = [];
      
      Object.entries(currentSchedule).forEach(([day, daySchedule]) => {
        Object.entries(daySchedule).forEach(([areaId, teacherIds]) => {
          teacherIds.forEach(teacherId => {
            dutySlotData.push({
              teacherId,
              areaId,
              day,
              week: selectedWeek.week,
              year: selectedWeek.year,
              isActive: true,
              updatedAt: new Date()
            });
          });
        });
      });

      if (dutySlotData.length > 0) {
        await bulkAddDutySlots(dutySlotData);
      }

      success('✅ Nöbet Programı Kaydedildi', `${selectedWeek.week}. hafta nöbet programı başarıyla kaydedildi`);
      setHasUnsavedChanges(false);
      
    } catch (err) {
      error('❌ Kayıt Hatası', 'Nöbet programı kaydedilirken hata oluştu');
    }
  };

  const resetSchedule = () => {
    confirmReset(() => {
      const emptySchedule: DutySchedule['schedule'] = {};
      DUTY_DAYS.forEach(day => {
        emptySchedule[day] = {};
        dutyAreas.forEach(area => {
          emptySchedule[day][area.id] = [];
        });
      });
      setCurrentSchedule(emptySchedule);
      setHasUnsavedChanges(false);
      success('🔄 Program Sıfırlandı', 'Nöbet programı sıfırlandı');
    });
  };

  const getTotalAssignments = (): number => {
    return Object.values(currentSchedule).reduce((total, day) =>
      total + Object.values(day).reduce((dayTotal, assignments) =>
        dayTotal + assignments.length, 0
      ), 0
    );
  };

  const getTeacherStats = (teacherId: string) => {
    return calculateTeacherDutyLoad(teacherId, dutySlots, selectedWeek.week, selectedWeek.year);
  };

  return (
    <div className="container-mobile">
      {/* Header */}
      <div className="header-mobile">
        <div className="flex items-center">
          <Shield className="w-8 h-8 text-purple-600 mr-3" />
          <div>
            <h1 className="text-responsive-xl font-bold text-gray-900">Nöbet Yönetimi</h1>
            <p className="text-responsive-sm text-gray-600">
              Okul nöbet programlarını oluşturun ve yönetin
              {hasUnsavedChanges && (
                <span className="ml-2 inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">
                  Kaydedilmemiş değişiklikler
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Week Selection and Controls */}
      <div className="mobile-card mobile-spacing mb-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
          {/* Week Selection - 4 columns */}
          <div className="lg:col-span-4">
            <Select
              label="Hafta Seçin"
              value={`${selectedWeek.week}-${selectedWeek.year}`}
              onChange={(value) => {
                const [week, year] = value.split('-').map(Number);
                setSelectedWeek({ week, year });
              }}
              options={weekOptions}
            />
          </div>
          
          {/* Stats - 4 columns */}
          <div className="lg:col-span-4">
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <div className="text-sm text-gray-600 mb-1">Toplam Nöbet Ataması</div>
              <div className="text-lg font-bold text-purple-600">
                {getTotalAssignments()} atama
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {selectedWeek.week}. hafta
                {hasUnsavedChanges && (
                  <span className="ml-2 text-yellow-600">• Kaydedilmedi</span>
                )}
              </div>
            </div>
          </div>
          
          {/* Action Buttons - 4 columns */}
          <div className="lg:col-span-4">
            <div className="button-group-mobile">
              <Button
                onClick={generateAutomaticSchedule}
                icon={RotateCcw}
                variant="secondary"
                disabled={isGenerating}
                className="w-full sm:w-auto"
              >
                {isGenerating ? 'Oluşturuluyor...' : 'Otomatik Oluştur'}
              </Button>
              <Button
                onClick={saveSchedule}
                icon={Save}
                variant="primary"
                disabled={!hasUnsavedChanges}
                className="w-full sm:w-auto"
              >
                Kaydet
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="responsive-grid gap-responsive mb-6">
        <div className="mobile-card mobile-spacing">
          <div className="flex items-center">
            <Users className="w-8 h-8 text-blue-600 mr-3" />
            <div>
              <p className="text-sm text-gray-600">Toplam Öğretmen</p>
              <p className="text-2xl font-bold text-gray-900">{teachers.length}</p>
            </div>
          </div>
        </div>
        <div className="mobile-card mobile-spacing">
          <div className="flex items-center">
            <MapPin className="w-8 h-8 text-emerald-600 mr-3" />
            <div>
              <p className="text-sm text-gray-600">Nöbet Alanları</p>
              <p className="text-2xl font-bold text-gray-900">{dutyAreas.length}</p>
            </div>
          </div>
        </div>
        <div className="mobile-card mobile-spacing">
          <div className="flex items-center">
            <Calendar className="w-8 h-8 text-purple-600 mr-3" />
            <div>
              <p className="text-sm text-gray-600">Bu Hafta</p>
              <p className="text-2xl font-bold text-gray-900">{getTotalAssignments()}</p>
            </div>
          </div>
        </div>
        <div className="mobile-card mobile-spacing">
          <div className="flex items-center">
            <Shield className="w-8 h-8 text-orange-600 mr-3" />
            <div>
              <p className="text-sm text-gray-600">Aktif Nöbetler</p>
              <p className="text-2xl font-bold text-gray-900">
                {dutySlots.filter(s => s.isActive).length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Duty Schedule Table */}
      <div className="mobile-card overflow-hidden">
        <div className="p-4 bg-purple-50 border-b border-purple-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-purple-900 text-lg">
                🛡️ {selectedWeek.week}. Hafta Nöbet Programı
              </h3>
              <p className="text-purple-700 mt-1">
                <span className="font-medium">{formatWeekRange(selectedWeek.week, selectedWeek.year)}</span>
                <span className="ml-4">Toplam: <strong>{getTotalAssignments()} nöbet ataması</strong></span>
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                onClick={resetSchedule}
                icon={RotateCcw}
                variant="secondary"
                size="sm"
                disabled={!hasUnsavedChanges}
              >
                Sıfırla
              </Button>
              <Button
                onClick={() => setShowStatsModal(true)}
                icon={Users}
                variant="secondary"
                size="sm"
              >
                İstatistikler
              </Button>
            </div>
          </div>
        </div>
        
        <div className="table-responsive">
          <table className="min-w-full">
            <thead className="bg-purple-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold text-purple-800 uppercase tracking-wider">
                  Nöbet Alanı
                </th>
                {DUTY_DAYS.map(day => (
                  <th key={day} className="px-4 py-3 text-center text-xs font-bold text-purple-800 uppercase tracking-wider">
                    <div className="font-bold">{day}</div>
                    <div className="text-xs mt-1 font-normal">
                      {getWeekDates(selectedWeek.week, selectedWeek.year)[DUTY_DAYS.indexOf(day)]?.getDate()}.
                      {getWeekDates(selectedWeek.week, selectedWeek.year)[DUTY_DAYS.indexOf(day)]?.getMonth() + 1}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sortedAreas.map((area, areaIndex) => (
                <tr key={area.id} className={areaIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-4 py-4 font-medium text-gray-900 bg-purple-50">
                    <div className="text-center">
                      <div className="font-bold text-lg text-purple-800">
                        {area.name}
                      </div>
                      <div className="text-xs text-purple-600 mt-1">
                        Kapasite: {area.capacity} kişi
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {area.description}
                      </div>
                    </div>
                  </td>
                  {DUTY_DAYS.map(day => {
                    const assignments = getAreaAssignments(day, area.id);
                    const isFull = assignments.length >= area.capacity;
                    
                    return (
                      <td key={`${day}-${area.id}`} className="px-2 py-2">
                        <div className={`min-h-[100px] p-3 rounded-lg border-2 ${
                          isFull 
                            ? 'bg-green-50 border-green-300' 
                            : assignments.length > 0 
                            ? 'bg-yellow-50 border-yellow-300' 
                            : 'bg-gray-50 border-gray-300 border-dashed'
                        }`}>
                          <div className="space-y-2">
                            {assignments.map(teacherId => {
                              const teacher = teachers.find(t => t.id === teacherId);
                              return (
                                <div
                                  key={teacherId}
                                  className="flex items-center justify-between bg-white rounded p-2 shadow-sm"
                                >
                                  <div className="text-sm font-medium text-gray-900">
                                    {teacher?.name || 'Bilinmeyen'}
                                  </div>
                                  <button
                                    onClick={() => removeTeacherFromDuty(day, area.id, teacherId)}
                                    className="text-red-500 hover:text-red-700 text-xs"
                                  >
                                    ✕
                                  </button>
                                </div>
                              );
                            })}
                            
                            {!isFull && (
                              <select
                                onChange={(e) => {
                                  if (e.target.value) {
                                    assignTeacherToDuty(day, area.id, e.target.value);
                                    e.target.value = '';
                                  }
                                }}
                                className="w-full text-xs border border-gray-300 rounded p-1"
                                defaultValue=""
                              >
                                <option value="">Öğretmen Ekle...</option>
                                {sortedTeachers
                                  .filter(teacher => {
                                    // Filter out already assigned teachers
                                    if (assignments.includes(teacher.id)) return false;
                                    // Filter out teachers with 2+ duties this week
                                    if (getTeacherDutyCount(teacher.id) >= 2) return false;
                                    // Filter out teachers with duty on same day
                                    const dayAssignments = Object.values(currentSchedule[day] || {}).flat();
                                    if (dayAssignments.includes(teacher.id)) return false;
                                    return true;
                                  })
                                  .map(teacher => (
                                    <option key={teacher.id} value={teacher.id}>
                                      {teacher.name} ({getTeacherDutyCount(teacher.id)}/2)
                                    </option>
                                  ))}
                              </select>
                            )}
                            
                            <div className="text-xs text-center text-gray-500 mt-2">
                              {assignments.length}/{area.capacity}
                              {isFull && <span className="text-green-600 ml-1">✓ Dolu</span>}
                            </div>
                          </div>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Teacher Statistics Modal */}
      <Modal
        isOpen={showStatsModal}
        onClose={() => setShowStatsModal(false)}
        title="Öğretmen Nöbet İstatistikleri"
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-blue-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">
                {teachers.filter(t => getTeacherDutyCount(t.id) === 0).length}
              </div>
              <div className="text-sm text-blue-800">Nöbetsiz Öğretmen</div>
            </div>
            <div className="bg-yellow-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-yellow-600">
                {teachers.filter(t => getTeacherDutyCount(t.id) === 1).length}
              </div>
              <div className="text-sm text-yellow-800">1 Nöbet</div>
            </div>
            <div className="bg-green-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-green-600">
                {teachers.filter(t => getTeacherDutyCount(t.id) === 2).length}
              </div>
              <div className="text-sm text-green-800">2 Nöbet (Tam)</div>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Öğretmen
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                    Bu Hafta
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                    Toplam
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                    Durum
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {sortedTeachers.map(teacher => {
                  const weeklyCount = getTeacherDutyCount(teacher.id);
                  const stats = getTeacherStats(teacher.id);
                  
                  return (
                    <tr key={teacher.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {teacher.name}
                        </div>
                        <div className="text-sm text-gray-500">
                          {teacher.branch} - {teacher.level}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          weeklyCount === 0 ? 'bg-red-100 text-red-800' :
                          weeklyCount === 1 ? 'bg-yellow-100 text-yellow-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {weeklyCount}/2
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900">
                        {stats.totalDuties}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {weeklyCount === 2 ? (
                          <CheckCircle className="w-5 h-5 text-green-500 mx-auto" />
                        ) : weeklyCount === 1 ? (
                          <AlertTriangle className="w-5 h-5 text-yellow-500 mx-auto" />
                        ) : (
                          <div className="w-5 h-5 border-2 border-gray-300 rounded-full mx-auto" />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmation.isOpen}
        onClose={hideConfirmation}
        onConfirm={confirmation.onConfirm}
        title={confirmation.title}
        message={confirmation.message}
        type={confirmation.type}
        confirmText={confirmation.confirmText}
        cancelText={confirmation.cancelText}
        confirmVariant={confirmation.confirmVariant}
      />
    </div>
  );
};

export default DutyManagement;