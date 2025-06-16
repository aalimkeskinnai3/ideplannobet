import React, { useState, useRef } from 'react';
import { FileText, Download, Calendar, Users, MapPin, TrendingUp } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { Teacher } from '../types';
import { DutyArea, DutySlot, DutySchedule, DUTY_DAYS, getCurrentWeek, getWeekDates, formatWeekRange, calculateTeacherDutyLoad } from '../types/duty';
import { useFirestore } from '../hooks/useFirestore';
import { useDutyFirestore } from '../hooks/useDutyFirestore';
import { useToast } from '../hooks/useToast';
import Button from '../components/UI/Button';
import Select from '../components/UI/Select';

const DutyReports = () => {
  const { data: teachers } = useFirestore<Teacher>('teachers');
  const { data: dutyAreas } = useDutyFirestore<DutyArea>('dutyAreas');
  const { data: dutySlots } = useDutyFirestore<DutySlot>('dutySlots');
  const { data: dutySchedules } = useDutyFirestore<DutySchedule>('dutySchedules');
  
  const { success, error } = useToast();
  
  const [selectedWeek, setSelectedWeek] = useState(getCurrentWeek());
  const [reportType, setReportType] = useState<'weekly' | 'monthly' | 'teacher'>('weekly');
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const sortedTeachers = [...teachers].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  const sortedAreas = [...dutyAreas].sort((a, b) => a.priority - b.priority);

  const weekOptions = [];
  for (let i = -10; i <= 2; i++) {
    const current = getCurrentWeek();
    const week = current.week + i;
    const year = current.year;
    weekOptions.push({
      value: `${week}-${year}`,
      label: `${week}. Hafta (${formatWeekRange(week, year)})`
    });
  }

  const teacherOptions = sortedTeachers.map(teacher => ({
    value: teacher.id,
    label: `${teacher.name} (${teacher.branch})`
  }));

  const getWeeklySchedule = () => {
    return dutySchedules.find(s => 
      s.week === selectedWeek.week && s.year === selectedWeek.year
    );
  };

  const getTeacherDutyHistory = (teacherId: string, weeks: number = 4) => {
    const history: { week: number; year: number; duties: DutySlot[] }[] = [];
    
    for (let i = 0; i < weeks; i++) {
      const week = selectedWeek.week - i;
      const year = selectedWeek.year;
      
      const weekDuties = dutySlots.filter(slot => 
        slot.teacherId === teacherId && 
        slot.week === week && 
        slot.year === year &&
        slot.isActive
      );
      
      history.push({ week, year, duties: weekDuties });
    }
    
    return history;
  };

  const generateWeeklyReport = () => {
    const schedule = getWeeklySchedule();
    if (!schedule) return null;

    const stats = {
      totalAssignments: 0,
      areaStats: {} as { [areaId: string]: number },
      teacherStats: {} as { [teacherId: string]: number }
    };

    Object.values(schedule.schedule).forEach(day => {
      Object.entries(day).forEach(([areaId, teacherIds]) => {
        stats.totalAssignments += teacherIds.length;
        stats.areaStats[areaId] = (stats.areaStats[areaId] || 0) + teacherIds.length;
        
        teacherIds.forEach(teacherId => {
          stats.teacherStats[teacherId] = (stats.teacherStats[teacherId] || 0) + 1;
        });
      });
    });

    return { schedule, stats };
  };

  const generatePDF = async () => {
    if (!printRef.current) return;

    setIsGenerating(true);
    
    try {
      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        width: printRef.current.scrollWidth,
        height: printRef.current.scrollHeight
      });

      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      const imgData = canvas.toDataURL('image/png', 1.0);
      const imgWidth = 297;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const yOffset = imgHeight < 210 ? (210 - imgHeight) / 2 : 0;

      pdf.addImage(imgData, 'PNG', 0, yOffset, imgWidth, imgHeight);

      const fileName = `Nobet_Raporu_${selectedWeek.week}_Hafta_${selectedWeek.year}.pdf`;
      pdf.save(fileName);
      
      success('📄 PDF İndirildi', 'Nöbet raporu başarıyla indirildi');
      
    } catch (err) {
      error('❌ PDF Hatası', 'PDF oluşturulurken hata oluştu');
    } finally {
      setIsGenerating(false);
    }
  };

  const weeklyReport = generateWeeklyReport();

  return (
    <div className="container-mobile">
      {/* Header */}
      <div className="header-mobile">
        <div className="flex items-center">
          <FileText className="w-8 h-8 text-orange-600 mr-3" />
          <div>
            <h1 className="text-responsive-xl font-bold text-gray-900">Nöbet Raporları</h1>
            <p className="text-responsive-sm text-gray-600">Nöbet programı raporlarını görüntüleyin ve indirin</p>
          </div>
        </div>
        <div className="button-group-mobile">
          <Button
            onClick={generatePDF}
            icon={Download}
            variant="primary"
            disabled={isGenerating || !weeklyReport}
            className="w-full sm:w-auto"
          >
            {isGenerating ? 'PDF Oluşturuluyor...' : 'PDF İndir'}
          </Button>
        </div>
      </div>

      {/* Controls */}
      <div className="mobile-card mobile-spacing mb-6">
        <div className="responsive-grid-3 gap-responsive">
          <Select
            label="Rapor Türü"
            value={reportType}
            onChange={(value) => setReportType(value as any)}
            options={[
              { value: 'weekly', label: 'Haftalık Rapor' },
              { value: 'monthly', label: 'Aylık Rapor' },
              { value: 'teacher', label: 'Öğretmen Raporu' }
            ]}
          />
          
          <Select
            label="Hafta Seçin"
            value={`${selectedWeek.week}-${selectedWeek.year}`}
            onChange={(value) => {
              const [week, year] = value.split('-').map(Number);
              setSelectedWeek({ week, year });
            }}
            options={weekOptions}
          />
          
          {reportType === 'teacher' && (
            <Select
              label="Öğretmen Seçin"
              value={selectedTeacherId}
              onChange={setSelectedTeacherId}
              options={teacherOptions}
            />
          )}
        </div>
      </div>

      {/* Report Content */}
      <div className="mobile-card overflow-hidden">
        <div ref={printRef} style={{ padding: '20px', backgroundColor: 'white' }}>
          {/* Report Header */}
          <div style={{ marginBottom: '30px', textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: '20px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: '0 0 10px 0', color: '#000' }}>
              İDE Okulları Nöbet Raporu
            </h1>
            <p style={{ fontSize: '16px', margin: 0, color: '#666' }}>
              {reportType === 'weekly' && `${selectedWeek.week}. Hafta (${formatWeekRange(selectedWeek.week, selectedWeek.year)})`}
              {reportType === 'teacher' && selectedTeacherId && 
                `${teachers.find(t => t.id === selectedTeacherId)?.name} - Nöbet Geçmişi`
              }
            </p>
          </div>

          {/* Weekly Report */}
          {reportType === 'weekly' && weeklyReport && (
            <div>
              {/* Statistics */}
              <div style={{ marginBottom: '30px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '15px', color: '#000' }}>
                  📊 Haftalık İstatistikler
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
                  <div style={{ textAlign: 'center', padding: '15px', backgroundColor: '#f3f4f6', borderRadius: '8px' }}>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#7c3aed' }}>
                      {weeklyReport.stats.totalAssignments}
                    </div>
                    <div style={{ fontSize: '14px', color: '#666' }}>Toplam Nöbet</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '15px', backgroundColor: '#f3f4f6', borderRadius: '8px' }}>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#059669' }}>
                      {Object.keys(weeklyReport.stats.teacherStats).length}
                    </div>
                    <div style={{ fontSize: '14px', color: '#666' }}>Nöbetçi Öğretmen</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '15px', backgroundColor: '#f3f4f6', borderRadius: '8px' }}>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#dc2626' }}>
                      {dutyAreas.length}
                    </div>
                    <div style={{ fontSize: '14px', color: '#666' }}>Nöbet Alanı</div>
                  </div>
                </div>
              </div>

              {/* Schedule Table */}
              <div style={{ marginBottom: '30px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '15px', color: '#000' }}>
                  📅 Haftalık Nöbet Programı
                </h2>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f9fafb' }}>
                      <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'left', fontWeight: 'bold' }}>
                        Nöbet Alanı
                      </th>
                      {DUTY_DAYS.map(day => (
                        <th key={day} style={{ border: '1px solid #000', padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>
                          {day}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedAreas.map((area, index) => (
                      <tr key={area.id} style={{ backgroundColor: index % 2 === 0 ? '#ffffff' : '#f9fafb' }}>
                        <td style={{ border: '1px solid #000', padding: '8px', fontWeight: 'bold' }}>
                          {area.name}
                        </td>
                        {DUTY_DAYS.map(day => {
                          const assignments = weeklyReport.schedule.schedule[day]?.[area.id] || [];
                          return (
                            <td key={day} style={{ border: '1px solid #000', padding: '8px', textAlign: 'center' }}>
                              {assignments.map(teacherId => {
                                const teacher = teachers.find(t => t.id === teacherId);
                                return (
                                  <div key={teacherId} style={{ marginBottom: '2px', fontSize: '11px' }}>
                                    {teacher?.name || 'Bilinmeyen'}
                                  </div>
                                );
                              })}
                              {assignments.length === 0 && (
                                <span style={{ color: '#999', fontSize: '10px' }}>Boş</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Teacher Statistics */}
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '15px', color: '#000' }}>
                  👥 Öğretmen Nöbet Dağılımı
                </h2>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f9fafb' }}>
                      <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'left', fontWeight: 'bold' }}>
                        Öğretmen
                      </th>
                      <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>
                        Branş
                      </th>
                      <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>
                        Bu Hafta
                      </th>
                      <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>
                        Toplam
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedTeachers
                      .filter(teacher => weeklyReport.stats.teacherStats[teacher.id] > 0)
                      .map((teacher, index) => {
                        const weeklyCount = weeklyReport.stats.teacherStats[teacher.id] || 0;
                        const stats = calculateTeacherDutyLoad(teacher.id, dutySlots, selectedWeek.week, selectedWeek.year);
                        
                        return (
                          <tr key={teacher.id} style={{ backgroundColor: index % 2 === 0 ? '#ffffff' : '#f9fafb' }}>
                            <td style={{ border: '1px solid #000', padding: '8px' }}>
                              {teacher.name}
                            </td>
                            <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'center' }}>
                              {teacher.branch}
                            </td>
                            <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>
                              {weeklyCount}
                            </td>
                            <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'center' }}>
                              {stats.totalDuties}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Teacher Report */}
          {reportType === 'teacher' && selectedTeacherId && (
            <div>
              {(() => {
                const teacher = teachers.find(t => t.id === selectedTeacherId);
                const history = getTeacherDutyHistory(selectedTeacherId);
                const stats = calculateTeacherDutyLoad(selectedTeacherId, dutySlots, selectedWeek.week, selectedWeek.year);
                
                return (
                  <div>
                    {/* Teacher Info */}
                    <div style={{ marginBottom: '30px', padding: '20px', backgroundColor: '#f3f4f6', borderRadius: '8px' }}>
                      <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '10px', color: '#000' }}>
                        👤 Öğretmen Bilgileri
                      </h2>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
                        <div>
                          <strong>Ad Soyad:</strong> {teacher?.name}<br/>
                          <strong>Branş:</strong> {teacher?.branch}<br/>
                          <strong>Seviye:</strong> {teacher?.level}
                        </div>
                        <div>
                          <strong>Bu Hafta:</strong> {stats.weeklyDuties} nöbet<br/>
                          <strong>Bu Ay:</strong> {stats.monthlyDuties} nöbet<br/>
                          <strong>Toplam:</strong> {stats.totalDuties} nöbet
                        </div>
                      </div>
                    </div>

                    {/* Duty History */}
                    <div>
                      <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '15px', color: '#000' }}>
                        📈 Son 4 Hafta Nöbet Geçmişi
                      </h2>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f9fafb' }}>
                            <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>
                              Hafta
                            </th>
                            <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>
                              Nöbet Sayısı
                            </th>
                            <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'left', fontWeight: 'bold' }}>
                              Nöbet Detayları
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {history.map((weekData, index) => (
                            <tr key={`${weekData.week}-${weekData.year}`} style={{ backgroundColor: index % 2 === 0 ? '#ffffff' : '#f9fafb' }}>
                              <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'center' }}>
                                {weekData.week}. Hafta
                              </td>
                              <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>
                                {weekData.duties.length}
                              </td>
                              <td style={{ border: '1px solid #000', padding: '8px' }}>
                                {weekData.duties.map(duty => {
                                  const area = dutyAreas.find(a => a.id === duty.areaId);
                                  return (
                                    <div key={duty.id} style={{ marginBottom: '2px', fontSize: '11px' }}>
                                      {duty.day} - {area?.name || 'Bilinmeyen Alan'}
                                    </div>
                                  );
                                })}
                                {weekData.duties.length === 0 && (
                                  <span style={{ color: '#999', fontSize: '10px' }}>Nöbet yok</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* No Data Message */}
          {reportType === 'weekly' && !weeklyReport && (
            <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
              <h2>Veri Bulunamadı</h2>
              <p>Seçilen hafta için nöbet programı bulunamadı.</p>
            </div>
          )}
        </div>
      </div>

      {/* Summary Statistics */}
      {weeklyReport && (
        <div className="responsive-grid gap-responsive mt-6">
          <div className="mobile-card mobile-spacing">
            <div className="flex items-center">
              <Calendar className="w-8 h-8 text-purple-600 mr-3" />
              <div>
                <p className="text-sm text-gray-600">Toplam Nöbet</p>
                <p className="text-2xl font-bold text-gray-900">{weeklyReport.stats.totalAssignments}</p>
              </div>
            </div>
          </div>
          <div className="mobile-card mobile-spacing">
            <div className="flex items-center">
              <Users className="w-8 h-8 text-blue-600 mr-3" />
              <div>
                <p className="text-sm text-gray-600">Nöbetçi Öğretmen</p>
                <p className="text-2xl font-bold text-gray-900">
                  {Object.keys(weeklyReport.stats.teacherStats).length}
                </p>
              </div>
            </div>
          </div>
          <div className="mobile-card mobile-spacing">
            <div className="flex items-center">
              <MapPin className="w-8 h-8 text-emerald-600 mr-3" />
              <div>
                <p className="text-sm text-gray-600">Aktif Alan</p>
                <p className="text-2xl font-bold text-gray-900">
                  {Object.keys(weeklyReport.stats.areaStats).length}
                </p>
              </div>
            </div>
          </div>
          <div className="mobile-card mobile-spacing">
            <div className="flex items-center">
              <TrendingUp className="w-8 h-8 text-orange-600 mr-3" />
              <div>
                <p className="text-sm text-gray-600">Ortalama/Öğretmen</p>
                <p className="text-2xl font-bold text-gray-900">
                  {Object.keys(weeklyReport.stats.teacherStats).length > 0 
                    ? (weeklyReport.stats.totalAssignments / Object.keys(weeklyReport.stats.teacherStats).length).toFixed(1)
                    : '0'
                  }
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DutyReports;