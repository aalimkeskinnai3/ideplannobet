export interface DutyArea {
  id: string;
  name: string;
  floor: string;
  capacity: number; // Kaç öğretmen nöbet tutabilir
  priority: number; // Öncelik sırası (1 = en yüksek)
  isActive: boolean;
  description?: string;
  createdAt: Date;
}

export interface DutySlot {
  id: string;
  teacherId: string;
  areaId: string;
  day: string;
  week: number; // Hangi hafta (1-52)
  year: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DutySchedule {
  id: string;
  week: number;
  year: number;
  schedule: {
    [day: string]: {
      [areaId: string]: string[]; // teacher IDs
    };
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface TeacherDutyStats {
  teacherId: string;
  weeklyDuties: number;
  monthlyDuties: number;
  totalDuties: number;
  lastDutyDate?: Date;
  preferredAreas?: string[];
  unavailableDays?: string[];
}

// Nöbet alanları sabit listesi
export const DUTY_AREAS: Omit<DutyArea, 'id' | 'createdAt'>[] = [
  {
    name: '3. Kat',
    floor: '3. Kat',
    capacity: 2,
    priority: 1,
    isActive: true,
    description: 'Üçüncü kat koridorları ve sınıfları'
  },
  {
    name: '2. Kat',
    floor: '2. Kat',
    capacity: 2,
    priority: 2,
    isActive: true,
    description: 'İkinci kat koridorları ve sınıfları'
  },
  {
    name: '1. Kat',
    floor: '1. Kat',
    capacity: 2,
    priority: 3,
    isActive: true,
    description: 'Birinci kat koridorları ve sınıfları'
  },
  {
    name: '0. Kat (Zemin)',
    floor: '0. Kat',
    capacity: 2,
    priority: 4,
    isActive: true,
    description: 'Zemin kat koridorları ve sınıfları'
  },
  {
    name: 'Bahçe',
    floor: 'Dış Alan',
    capacity: 3,
    priority: 5,
    isActive: true,
    description: 'Okul bahçesi ve dış alanlar'
  },
  {
    name: 'Atölye Katı',
    floor: 'Atölye',
    capacity: 1,
    priority: 6,
    isActive: true,
    description: 'Atölye ve teknik alanlar'
  },
  {
    name: 'Spor Salonu',
    floor: 'Spor',
    capacity: 1,
    priority: 7,
    isActive: true,
    description: 'Spor salonu ve jimnastik alanı'
  }
];

// Nöbet günleri (Pazartesi-Cuma)
export const DUTY_DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'];

// Hafta numarası hesaplama yardımcı fonksiyonları
export const getWeekNumber = (date: Date): number => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};

export const getCurrentWeek = (): { week: number; year: number } => {
  const now = new Date();
  return {
    week: getWeekNumber(now),
    year: now.getFullYear()
  };
};

export const getWeekDates = (week: number, year: number): Date[] => {
  const jan1 = new Date(year, 0, 1);
  const days = (week - 1) * 7;
  const weekStart = new Date(jan1.getTime() + days * 24 * 60 * 60 * 1000);
  
  // Pazartesi'yi bul
  const dayOfWeek = weekStart.getDay();
  const monday = new Date(weekStart);
  monday.setDate(weekStart.getDate() - dayOfWeek + 1);
  
  const weekDates: Date[] = [];
  for (let i = 0; i < 5; i++) { // Pazartesi-Cuma
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    weekDates.push(date);
  }
  
  return weekDates;
};

export const formatWeekRange = (week: number, year: number): string => {
  const dates = getWeekDates(week, year);
  const start = dates[0];
  const end = dates[4];
  
  return `${start.getDate()}.${start.getMonth() + 1} - ${end.getDate()}.${end.getMonth() + 1}.${year}`;
};

// Nöbet dağılım algoritması için yardımcı fonksiyonlar
export const calculateTeacherDutyLoad = (
  teacherId: string,
  dutySlots: DutySlot[],
  week: number,
  year: number
): TeacherDutyStats => {
  const teacherDuties = dutySlots.filter(slot => 
    slot.teacherId === teacherId && slot.isActive
  );
  
  const weeklyDuties = teacherDuties.filter(slot => 
    slot.week === week && slot.year === year
  ).length;
  
  const monthlyDuties = teacherDuties.filter(slot => {
    const slotDate = getWeekDates(slot.week, slot.year)[0];
    const currentDate = getWeekDates(week, year)[0];
    return slotDate.getMonth() === currentDate.getMonth() && 
           slotDate.getFullYear() === currentDate.getFullYear();
  }).length;
  
  return {
    teacherId,
    weeklyDuties,
    monthlyDuties,
    totalDuties: teacherDuties.length,
    lastDutyDate: teacherDuties.length > 0 ? 
      getWeekDates(teacherDuties[teacherDuties.length - 1].week, teacherDuties[teacherDuties.length - 1].year)[0] : 
      undefined
  };
};