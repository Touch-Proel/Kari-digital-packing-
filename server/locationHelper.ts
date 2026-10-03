import { DeliveryZone } from './types';

export interface DeliveryZoneResult {
  zone: DeliveryZone;
  label: string;
  detectedLocation?: string;
  matchedKeyword?: string;
  hasExplicitLocation?: boolean;
}

// =========================================================================
// 🗺️ CAMBODIAN GEOGRAPHY KNOWLEDGE BASE (OPTIMIZED FOR PHNOM PENH FOCUS)
// =========================================================================

// ១. ខណ្ឌទាំង ១៤ នៃរាជធានីភ្នំពេញ (Phnom Penh 14 Khans)
export const PP_KHANS = [
  'ខណ្ឌដូនពេញ', 'ដូនពេញ', 'daun penh', 'daunpenh',
  'ខណ្ឌចំការមន', 'ចំការមន', 'chamkarmon', 'chamkar mon',
  'ខណ្ឌ៧មករា', 'ខណ្ឌ ៧មករា', '៧មករា', '7មករា', '7 makara', '7makara', 'ប្រាំពីរមករា',
  'ខណ្ឌទួលគោក', 'ទួលគោក', 'toul kork', 'toulkork', 'tuol kouk',
  'ខណ្ឌដង្កោ', 'ដង្កោ', 'dangkao', 'dangkor',
  'ខណ្ឌមានជ័យ', 'មានជ័យ', 'mean chey', 'meanchey',
  'ខណ្ឌឫស្សីកែវ', 'ខណ្ឌឬស្សីកែវ', 'ឫស្សីកែវ', 'ឬស្សីកែវ', 'russey keo', 'russeykeo',
  'ខណ្ឌសែនសុខ', 'សែនសុខ', 'sen sok', 'sensok',
  'ខណ្ឌពោធិ៍សែនជ័យ', 'ខណ្ឌពោធសែនជ័យ', 'ខណ្ឌពោធិសែនជ័យ', 'ខណ្ឌពោសែនជ័យ', 'ពោធិ៍សែនជ័យ', 'ពោធសែនជ័យ', 'ពោធិសែនជ័យ', 'ពោសែនជ័យ', 'pou senchey', 'porsenchey',
  'ខណ្ឌច្បារអំពៅ', 'ច្បារអំពៅ', 'chbar ampov', 'chbarampov',
  'ខណ្ឌជ្រោយចង្វារ', 'ខណ្ឌជ្រោយចង្វា', 'ជ្រោយចង្វារ', 'ជ្រោយចង្វា', 'chroy changvar', 'chroychangvar',
  'ខណ្ឌព្រែកព្នៅ', 'ព្រែកព្នៅ', 'prek pnov', 'prekpnov',
  'ខណ្ឌបឹងកេងកង', 'បឹងកេងកង', 'boeung keng kang', 'bkk',
  'ខណ្ឌកំបូល', 'កំបូល', 'kamboul', 'kombol'
];

// ២. សង្កាត់ទាំង ១០៥ និងតំបន់ល្បីៗនៅភ្នំពេញ (Phnom Penh 105 Sangkats & Popular Quarters)
export const PP_SANGKATS_AND_AREAS = [
  // ដូនពេញ
  'ផ្សារថ្មីទី១', 'ផ្សារថ្មីទី 1', 'ផ្សារថ្មី១', 'ផ្សារថ្មី1',
  'ផ្សារថ្មីទី២', 'ផ្សារថ្មីទី 2', 'ផ្សារថ្មី២', 'ផ្សារថ្មី2',
  'ផ្សារថ្មីទី៣', 'ផ្សារថ្មីទី 3', 'ផ្សារថ្មី៣', 'ផ្សារថ្មី3', 'ផ្សារថ្មី', 'ផ្សារធំថ្មី',
  'បឹងរាំង', 'ផ្សារកណ្តាលទី១', 'ផ្សារកណ្តាលទី 1', 'ផ្សារកណ្តាល១', 'ផ្សារកណ្តាល1',
  'ផ្សារកណ្តាលទី២', 'ផ្សារកណ្តាលទី 2', 'ផ្សារកណ្តាល២', 'ផ្សារកណ្តាល2', 'ផ្សារកណ្តាល', 'ផ្សារកណ្ដាល',
  'ចតុមុខ', 'ជ័យជំនះ', 'ផ្សារចាស់', 'ស្រះចក', 'វត្តភ្នំ',

  // ចំការមន & បឹងកេងកង
  'ទន្លេបាសាក់', 'កោះពេជ្រ',
  'បឹងកេងកងទី១', 'បឹងកេងកងទី 1', 'បឹងកេងកង១', 'បឹងកេងកង1', 'bkk1',
  'បឹងកេងកងទី២', 'បឹងកេងកងទី 2', 'បឹងកេងកង២', 'បឹងកេងកង2', 'bkk2',
  'បឹងកេងកងទី៣', 'បឹងកេងកងទី 3', 'បឹងកេងកង៣', 'បឹងកេងកង3', 'bkk3',
  'អូឡាំពិក', 'ស្តាតអូឡាំពិក',
  'ទួលស្វាយព្រៃទី១', 'ទួលស្វាយព្រៃទី 1', 'ទួលស្វាយព្រៃ១', 'ទួលស្វាយព្រៃ1',
  'ទួលស្វាយព្រៃទី២', 'ទួលស្វាយព្រៃទី 2', 'ទួលស្វាយព្រៃ២', 'ទួលស្វាយព្រៃ2', 'ទួលស្វាយព្រៃ',
  'ទំនប់ទឹក', 'ស្តុបបូកគោ',
  'ទួលទំពូងទី១', 'ទួលទំពូងទី 1', 'ទួលទំពូង១', 'ទួលទំពូង1',
  'ទួលទំពូងទី២', 'ទួលទំពូងទី 2', 'ទួលទំពូង២', 'ទួលទំពូង2', 'ទួលទំពូង', 'ផ្សារទួលទំពូង',
  'បឹងត្របែក', 'ផ្សារបឹងត្របែក', 'ផ្សារដើមថ្កូវ', 'ដើមថ្កូវ', 'ផ្សារកាប់គោ', 'កាប់គោ',

  // ៧មករា
  'អូរឫស្សីទី១', 'អូរឫស្សីទី 1', 'អូរឫស្សី១', 'អូរឫស្សី1',
  'អូរឫស្សីទី២', 'អូរឫស្សីទី 2', 'អូរឫស្សី២', 'អូរឫស្សី2',
  'អូរឫស្សីទី៣', 'អូរឫស្សីទី 3', 'អូរឫស្សី៣', 'អូរឫស្សី3',
  'អូរឫស្សីទី៤', 'អូរឫស្សីទី 4', 'អូរឫស្សី៤', 'អូរឫស្សី4',
  'អូរឫស្សី', 'អូរឬស្សី', 'ផ្សារអូរឫស្សី', 'ផ្សារអូរឬស្សី',
  'មនោរម្យ', 'មិត្តភាព', 'វាលវង់', 'បឹងព្រលិត', 'បាក់ទូក', 'សាលាបាក់ទូក',

  // ទួលគោក
  'ផ្សារដេប៉ូទី១', 'ផ្សារដេប៉ូទី 1', 'ផ្សារដេប៉ូ១', 'ផ្សារដេប៉ូ1',
  'ផ្សារដេប៉ូទី២', 'ផ្សារដេប៉ូទី 2', 'ផ្សារដេប៉ូ២', 'ផ្សារដេប៉ូ2',
  'ផ្សារដេប៉ូទី៣', 'ផ្សារដេប៉ូទី 3', 'ផ្សារដេប៉ូ៣', 'ផ្សារដេប៉ូ3',
  'ផ្សារដេប៉ូ', 'ដេប៉ូទី១', 'ដេប៉ូទី 1', 'ដេប៉ូទី1', 'ដេប៉ូទី២', 'ដេប៉ូទី 2', 'ដេប៉ូទី2', 'ដេប៉ូ',
  'ទឹកល្អក់ទី១', 'ទឹកល្អក់ទី 1', 'ទឹកល្អក់១', 'ទឹកល្អក់1',
  'ទឹកល្អក់ទី២', 'ទឹកល្អក់ទី 2', 'ទឹកល្អក់២', 'ទឹកល្អក់2',
  'ទឹកល្អក់ទី៣', 'ទឹកល្អក់ទី 3', 'ទឹកល្អក់៣', 'ទឹកល្អក់3', 'ទឹកល្អក់',
  'បឹងកក់ទី១', 'បឹងកក់ទី 1', 'បឹងកក់១', 'បឹងកក់1',
  'បឹងកក់ទី២', 'បឹងកក់ទី 2', 'បឹងកក់២', 'បឹងកក់2', 'បឹងកក់',
  'បឹងសាឡាង', 'ផ្សារដើមគរ', 'ផ្សារដើមគ', 'ដើមគរ', 'ដើមគ',
  'ផ្សារមាន់អាំង', 'ផ្សារសាមគ្គី', 'ផ្សារតូច', 'សន្ធរម៉ុក', 'សាលាឥន្ទ្រទេវី', 'អង់តែនទួលគោក',

  // ឫស្សីកែវ
  'គីឡូម៉ែត្រលេខ៦', 'គីឡូម៉ែត្រលេខ ៦', 'គីឡូម៉ែត្រ៦', 'គីឡូម៉ែត្រ6', 'គីឡូ៦', 'គីឡូ 6', 'គីឡូ6', 'គីឡូលេខ៦', 'គីឡូលេខ6',
  'គីឡូ៧', 'គីឡូ 7', 'គីឡូ7', 'គីឡូលេខ៧', 'គីឡូលេខ7',
  'គីឡូ៨', 'គីឡូ 8', 'គីឡូ8', 'គីឡូលេខ៨', 'គីឡូលេខ8',
  'គីឡូ៩', 'គីឡូ 9', 'គីឡូ9', 'គីឡូលេខ៩', 'គីឡូលេខ9',
  'គីឡូ១០', 'គីឡូ 10', 'គីឡូ10', 'គីឡូលេខ១០', 'គីឡូលេខ10',
  'ផ្សារគីឡូលេខ៤', 'ផ្សារគីឡូ៤', 'ផ្សារគីឡូ4', 'គីឡូ៤', 'គីឡូ4', 'គីឡូ5', 'គីឡូ៥',
  'ទួលសង្កែទី១', 'ទួលសង្កែទី 1', 'ទួលសង្កែ១', 'ទួលសង្កែ1',
  'ទួលសង្កែទី២', 'ទួលសង្កែទី 2', 'ទួលសង្កែ២', 'ទួលសង្កែ2',
  'ទួលសង្កែ', 'tuol sangke', 'ផ្សារទួលសង្កែ',
  'ស្វាយប៉ាក', 'ច្រាំងចំរេះទី១', 'ច្រាំងចំរេះ១', 'ច្រាំងចំរេះ1', 'ច្រាំងចំរេះទី២', 'ច្រាំងចំរេះ២', 'ច្រាំងចំរេះ2', 'ច្រាំងចំរេះ',
  'គួចកាណុង', 'ស្ពានបាឡេ', 'សង្កាត់ឫស្សីកែវ', 'សង្កាត់ឬស្សីកែវ',

  // សែនសុខ
  'ភ្នំពេញថ្មី', 'ទឹកថ្លា', 'ផ្សារទឹកថ្លា', 'ឃ្មួញ', 'ក្រាំងធ្នង់', 'អូរបែកក្អម', 'គោកឃ្លាង',
  'ឈូកមាស', 'ផ្សារឈូកមាស', 'ពេទ្យអយឺតសែនសុខ', 'ពេទ្យអយឺត', 'អយឺតសែនសុខ', 'អយឺត',
  'ឈូកវ៉ាទី១', 'ឈូកវ៉ាទី 1', 'ឈូកវ៉ាទី1', 'ឈូកវ៉ា១', 'ឈូកវ៉ា1',
  'ឈូកវ៉ាទី២', 'ឈូកវ៉ាទី 2', 'ឈូកវ៉ាទី2', 'ឈូកវ៉ា២', 'ឈូកវ៉ា2',
  'ឈូកវ៉ាទី៣', 'ឈូកវ៉ាទី 3', 'ឈូកវ៉ាទី3', 'ឈូកវ៉ា៣', 'ឈូកវ៉ា3',
  'ឈូកវ៉ា', 'ឈូករ៉ាពី', 'ឈូករា៉ពី',
  'ផ្សារដីហុយ', 'សឡា', 'ផ្សារសឡា', 'ផ្សារបឹងបៃតង', 'បឹងបៃតង',

  // មានជ័យ
  'ចាក់អង្រែលើ', 'ចាក់អង្រែក្រោម', 'ចាក់អង្រែ', 'ផ្សារចាក់អង្រែ',
  'ស្ទឹងមានជ័យទី១', 'ស្ទឹងមានជ័យទី 1', 'ស្ទឹងមានជ័យ១', 'ស្ទឹងមានជ័យ1',
  'ស្ទឹងមានជ័យទី២', 'ស្ទឹងមានជ័យទី 2', 'ស្ទឹងមានជ័យ២', 'ស្ទឹងមានជ័យ2',
  'ស្ទឹងមានជ័យទី៣', 'ស្ទឹងមានជ័យទី 3', 'ស្ទឹងមានជ័យ៣', 'ស្ទឹងមានជ័យ3',
  'ស្ទឹងមានជ័យចាស់', 'ស្ទឹងមានជ័យថ្មី', 'ផ្សារស្ទឹងមានជ័យចាស់', 'ផ្សារស្ទឹងមានជ័យថ្មី', 'ផ្សារស្ទឹងមានជ័យ', 'ស្ទឹងមានជ័យ',
  'បឹងទំពុនទី១', 'បឹងទំពុនទី 1', 'បឹងទំពុន១', 'បឹងទំពុន1',
  'បឹងទំពុនទី២', 'បឹងទំពុនទី 2', 'បឹងទំពុន២', 'បឹងទំពុន2',
  'បឹងទំពុន', 'បឹងទំពន់', 'ក្បាលថ្នល់', 'ផ្សារដីថ្មី', 'ដីថ្មី', 'ផ្សារហេងលី', 'វត្តសន្សំកុសល', 'ផ្សារpc', 'ផ្សារ pc',
  'លូប្រាំ', 'លូ៥', 'លូ5', 'លូបី', 'លូ៣', 'លូ3', 'លូបួន', 'លូ៤', 'លូ4', 'ផ្សារលូប្រាំ',

  // ពោធិ៍សែនជ័យ & កំបូល
  'ចោមចៅទី១', 'ចោមចៅទី 1', 'ចោមចៅទី1', 'ចោមចៅ១', 'ចោមចៅ1',
  'ចោមចៅទី២', 'ចោមចៅទី 2', 'ចោមចៅទី2', 'ចោមចៅ២', 'ចោមចៅ2',
  'ចោមចៅទី៣', 'ចោមចៅទី 3', 'ចោមចៅទី3', 'ចោមចៅ៣', 'ចោមចៅ3',
  'ចោមចៅ', 'ចេាមចៅ', 'ផ្សារព្រៃទា', 'ព្រៃទា',
  'កាកាបទី១', 'កាកាបទី 1', 'កាកាបទី1', 'កាកាប១', 'កាកាប1',
  'កាកាបទី២', 'កាកាបទី 2', 'កាកាបទី2', 'កាកាប២', 'កាកាប2', 'កាកាប',
  'ត្រពាំងក្រសាំង', 'សំរោងក្រោម', 'វត្តជន្លង់ម្លូ', 'ជន្លង់ម្លូ',
  'កន្ទោក', 'ភ្លើងឆេះរទេះ', 'បឹងធំ', 'ស្នោរ', 'ឱឡោក', 'ប្រទះឡាង', 'ផ្សារកំបូល', 'កំបូល',
  'ផ្សារត្រពាំងថ្លឹង', 'ត្រពាំងថ្លឹង', 'ត្រពាំងពោធិ៍', 'ត្រពាំងរំចេក',
  'ផ្សារកាណាឌីយ៉ា', 'កាណាឌីយ៉ា', 'canadia',
  'វេងស្រេង', 'វ៉េងស្រេង', 'veng sreng', 'vengsreng',
  'ពោធិ៍ចិនតុង', 'ពោធិចិនតុង', 'ពោចិនតុង', 'pochentong',
  'ព្រលានយន្តហោះ', 'ព្រលាន', 'ផ្សារស៊ិនជូរី', 'ផ្សារសេនជូរី', 'ស៊ិនជូរី', 'សេនជូរី', 'century plaza',
  'ផ្សារជម្ពូវ័ន', 'ជម្ពូវ័ន', 'អូដឹម', 'ផ្សារអូដឹម', 'អូឌឹម', 'ផ្សារអូឌឹម',

  // ច្បារអំពៅ
  'ច្បារអំពៅទី១', 'ច្បារអំពៅទី 1', 'ច្បារអំពៅ១', 'ច្បារអំពៅ1',
  'ច្បារអំពៅទី២', 'ច្បារអំពៅទី 2', 'ច្បារអំពៅ២', 'ច្បារអំពៅ2',
  'ច្បារអំពៅ', 'ផ្សារច្បារអំពៅ', 'chbar ampov',
  'និរោធ', 'ព្រែកប្រា', 'ព្រែកឯង', 'ព្រែកថ្មី', 'ក្បាលកោះ', 'វាលស្បូវ', 'ផ្សារព្រែកឯង',

  // ជ្រោយចង្វារ
  'ជ្រោយចង្វារ', 'ជ្រោយចង្វា', 'chroy changvar',
  'ព្រែកលៀប', 'ព្រែបលាប', 'ព្រែកលាប', 'prek leap', 'ព្រែកតាសេក', 'កោះដាច់', 'បាក់ខែង',
  'វិមានឈ្នះឈ្នះ', 'ស្តាតមរតកតេជោ', 'ស្ពានជ្រោយចង្វារ',

  // ព្រែកព្នៅ
  'ព្រែកព្នៅ', 'prek pnov', 'ពញាពន់', 'គោករកា', 'ពន្សាំង', 'ផ្សារព្រែកព្នៅ',

  // ដង្កោ
  'ដង្កោ', 'dangkao', 'dangkor',
  'ព្រៃស', 'ព្រៃ ស', 'ស្តុបព្រៃស', 'សង្កាត់ព្រៃស',
  'ជើងឯក', 'ជេីងឯក', 'ពងទឹក', 'ក្រាំងពង្រ', 'សាក់សំពៅ', 'ទៀន', 'គងនយ', 'ស្ពានថ្ម', 'រលួស',
  'សង្កាត់ព្រៃវែង', 'ដង្កោ ព្រៃវែង',
  'ចំការដូង', 'ផ្សារចំការដូង', 'វត្តសំបួរ', 'សំបួរ', 'ទួលពង្រ', 'ផ្សារទួលពង្រ'
];

// ៣. បុរី និងគម្រោងលំនៅឋានល្បីៗនៅភ្នំពេញ (Famous Boreys in PP)
export const PP_BOREYS = [
  // ពិភពថ្មី
  'បុរីពិភពថ្មី', 'ពិភពថ្មី', 'piphop thmey',
  'ពិភពថ្មីចំការដូង', 'ពិភពថ្មីកំបូល', 'ពិភពថ្មីកួរស្រូវ', 'ពិភពថ្មីគួរស្រូវ', 'ពិភពថ្មីឈូកវ៉ា', 'ពិភពថ្មីតាខ្មៅ', 'ពិភពថ្មីអូដឹម', 'ពិភពថ្មីអូឌឹម',
  'ពិភពថ្មី១', 'ពិភពថ្មី1', 'ពិភពថ្មី២', 'ពិភពថ្មី2', 'ពិភពថ្មី៣', 'ពិភពថ្មី3',

  // ប៉េងហួត
  'បុរីប៉េងហួត', 'ប៉េងហួត', 'peng huoth', 'penghuoth',
  'ប៉េងហួតបឹងស្នោ', 'ប៉េងហួត60m', 'ប៉េងហួត 60m', 'ប៉េងហួត50m', 'ប៉េងហួត 50m', 'ប៉េងហួត2004', 'polaris',

  // ជីបម៉ុង
  'បុរីជីបម៉ុង', 'ជីបម៉ុង', 'chip mong', 'chipmong', 'ជីបម៉ុង598', 'ជីបម៉ុង271', 'ជីបម៉ុង60m', 'ជីបម៉ុងលែន',

  // អ័រគីដេ
  'បុរីអ័រគីដេ', 'អ័រគីដេ', 'orkide', 'orchid', 'អ័រគីដេ2004', 'អ័រគីដេពោធិ៍ចិនតុង', 'អ័រគីដេ60m',

  // ផ្សេងៗ
  'បុរីវិមានភ្នំពេញ', 'វិមានភ្នំពេញ',
  'បុរីភ្នំពេញថ្មី',
  'បុរីហុងឡាយ', 'ហុងឡាយ',
  'បុរីលឹមឈាងហាក់', 'លឹមឈាងហាក់',
  'បុរីសំប៊ួមាស', 'បុរីសំបួរមាស', 'សំប៊ួមាស', 'សំបួរមាស',
  'បុរីvip', 'បុរី vip',
  'បុរីឡុងនី', 'ឡុងនី',
  'បុរីវ៉ារីណា', 'វ៉ារីណា',
  'បុរីរុងរឿង',
  'បុរីកាំកូ', 'កាំកូ', 'camko city', 'camko',
  'បុរីមេគង្គលែន', 'មេគង្គលែន',
  'បុរីញូថោន', 'បុរីញូវថោន',
  'បុរីជលផល',
  'បុរីចន្ទ្រា',
  'បុរីសម្បត្តិមានហេង',
  'បុរីមហាសេដ្ឋី',
  'បុរីសុភមង្គល',
  'បុរីឡាយគង់',
  'សំណង់១២', 'សំណង់ 12', 'សំណង់12', 'សំណង១២', 'សំណង12', 'សំណង 12',
  'បុរីអូឌឹម', 'បុរីទួលពង្រ'
];

// ៤. ផ្សារទំនើប មន្ទីរពេទ្យ សាកលវិទ្យាល័យ និងផ្លូវធំៗនៅភ្នំពេញ
export const PP_LANDMARKS_AND_ROADS = [
  // ផ្សារទំនើប & Plaza
  'aeon1', 'aeon2', 'aeon3', 'aeon', 'អ៊ីអន១', 'អ៊ីអន1', 'អ៊ីអន២', 'អ៊ីអន2', 'អ៊ីអន៣', 'អ៊ីអន3', 'អ៊ីអន',
  'makro', 'ម៉ាក្រូ', 'tk avenue', 'eden garden', 'midtown', 'sorya', 'ratana plaza', 'ផ្សាររតនាផ្លាហ្សា', 'k mall',
  'chip mong mega mall', 'olympia', 'អូឡាំព្យា', 'the bridge',
  // មន្ទីរពេទ្យ
  'ពេទ្យតេជោ', 'កាល់ម៉ែត', 'calmette', 'ពេទ្យរុស្ស៊ី', 'ពេទ្យលោកសង្ឃ', 'ពេទ្យគន្ធបុប្ផា', 'ពេទ្យកុមារជាតិ',
  'ពេទ្យជប៉ុន', 'ពេទ្យព្រះកេតុមាលា', 'ពេទ្យជោរៃ',
  // សាលា
  'តិចណូ', 'itc', 'rupp', 'ifl',
  // ផ្លូវធំៗ
  'ផ្លូវ 2004', 'ផ្លូវ2004', 'ផ្លូវ 271', 'ផ្លូវ271', 'ផ្លូវ 371', 'ផ្លូវ371',
  'ផ្លូវ 598', 'ផ្លូវ598', 'ផ្លូវ 1986', 'ផ្លូវ1986', 'ផ្លូវ 1003', 'ផ្លូវ1003', 'ផ្លូវ 1928', 'ផ្លូវ1928',
  'ផ្លូវ 60ម៉ែត្រ', 'ផ្លូវ60ម៉ែត្រ', 'ផ្លូវ 60m', 'ផ្លូវ60m', '60ម៉ែត្រ', '60m',
  'ផ្លូវ 50ម៉ែត្រ', 'ផ្លូវ50ម៉ែត្រ', 'ផ្លូវ 50m', 'ផ្លូវ50m', '50ម៉ែត្រ', '50m',
  'ផ្លូវ 30ម៉ែត្រ', 'ផ្លូវ30ម៉ែត្រ', 'ផ្លូវ 30m', 'ផ្លូវ30m', '30ម៉ែត្រ', '30m',
  'ផ្លូវ 217', 'ផ្លូវ217', 'ផ្លូវ 564', 'ផ្លូវ564',
  'ផ្លូវ 105', 'ផ្លូវ105', 'ផ្លូវ 310', 'ផ្លូវ310', 'ផ្លូវ 182', 'ផ្លូវ182', 'ផ្លូវ 2002', 'ផ្លូវ2002',
  'ជាសុផារ៉ា', 'សហព័ន្ធរុស្ស៊ី', 'កម្ពុជាក្រោម', 'មុនីវង្ស', 'monivong', 'នរោត្តម', 'norodom',
  'ត្រសក់ផ្អែម', 'ម៉ុងឫទ្ធី', 'ម៉ុងរិទ្ធី', 'ទ្រីហេង', 'ហាន់ណូយ', 'ហានូយ', 'ហាណូយ',
  // ផ្លូវជាតិ
  'ផ្លូវជាតិលេខ១', 'ផ្លូវជាតិលេខ 1', 'ផ្លូវជាតិលេខ1', 'ផ្លូវជាតិ1',
  'ផ្លូវជាតិលេខ២', 'ផ្លូវជាតិលេខ 2', 'ផ្លូវជាតិលេខ2', 'ផ្លូវជាតិ2',
  'ផ្លូវជាតិលេខ៣', 'ផ្លូវជាតិលេខ 3', 'ផ្លូវជាតិលេខ3', 'ផ្លូវជាតិ3',
  'ផ្លូវជាតិលេខ៤', 'ផ្លូវជាតិលេខ 4', 'ផ្លូវជាតិលេខ4', 'ផ្លូវជាតិ4',
  'ផ្លូវជាតិលេខ៥', 'ផ្លូវជាតិលេខ 5', 'ផ្លូវជាតិលេខ5', 'ផ្លូវជាតិ5',
  'ផ្លូវជាតិលេខ៦', 'ផ្លូវជាតិលេខ 6', 'ផ្លូវជាតិលេខ6', 'ផ្លូវជាតិ6', 'ផ្លូវជាតិលេខ៦A', 'ផ្លូវជាតិ6a'
];

// ៥. តំបន់ជាយក្រុងដែលគិតជាសេវាដឹកភ្នំពេញ (Greater PP / Metropolitan Zone)
export const GREATER_PP_AREAS = [
  // ក្រុងតាខ្មៅ (Takhmao)
  'ក្រុងតាខ្មៅ', 'តាខ្មៅ', 'takhmao', 'ta khmao', 'ព្រែកហូរ', 'ចំពុះក្អែក', 'កោះក្របី',
  'ដើមមៀន', 'តាក្តុល', 'ស្ទឹងជ្រៅ', 'រកាខ្ពស់', 'ស្វាយរលំ', 'ផ្សារតាខ្មៅ',

  // ជិតភ្នំពេញ / កៀនស្វាយ / អរិយក្សត្រ / បែកចាន
  'អរិយក្សត្រ', 'ស្វាយជ្រុំ', 'ព្រែកតាមាក់', 'ព្រែកអញ្ចាញ',
  'បែកចាន', 'អង្គស្នួល', 'កៀនស្វាយ', 'កួរស្រូវ', 'គួរស្រូវ', 'ផ្សារកួរស្រូវ', 'ផ្សារគួរស្រូវ',
  'ផ្សារព្រែកជ្រៃ', 'ព្រែកជ្រៃ', 'វត្តស្លែង', 'កោះស្លាកែត', 'កោះអន្លង់ចិន', 'ល្វាឯម'
];

// ៦. ឈ្មោះខេត្តទាំង ២៤ (24 Clean Province Names - simplified as requested to avoid regex clutter)
export const PROVINCES_MAP: Array<{
  name: string;
  aliases: string[];
}> = [
  { name: 'សៀមរាប', aliases: ['siem reap', 'siemreap', 'sr'] },
  { name: 'បាត់ដំបង', aliases: ['battambang', 'btb'] },
  { name: 'កំពង់ចាម', aliases: ['kampong cham', 'kompong cham', 'kpc'] },
  { name: 'កំពង់ស្ពឺ', aliases: ['kampong speu', 'kompong speu', 'kps'] },
  { name: 'ព្រះសីហនុ', aliases: ['កំពង់សោម', 'កំបង់សោម', 'sihanoukville', 'kampong som', 'shv'] },
  { name: 'បន្ទាយមានជ័យ', aliases: ['banteay meanchey', 'bmc', 'ប៉ោយប៉ែត', 'សិរីសោភ័ណ'] },
  { name: 'តាកែវ', aliases: ['takeo', 'ដូនកែវ', 'ត្រាំកក់'] },
  { name: 'កំពត', aliases: ['kampot'] },
  { name: 'ស្វាយរៀង', aliases: ['svay rieng', 'svayrieng', 'បាវិត'] },
  { name: 'ព្រៃវែង', aliases: ['prey veng', 'preyveng'] },
  { name: 'កំពង់ធំ', aliases: ['kampong thom', 'kompong thom'] },
  { name: 'កំពង់ឆ្នាំង', aliases: ['kampong chhnang', 'kompong chhnang'] },
  { name: 'ពោធិ៍សាត់', aliases: ['pursat'] },
  { name: 'ក្រចេះ', aliases: ['kratie'] },
  { name: 'កោះកុង', aliases: ['koh kong', 'kohkong'] },
  { name: 'ត្បូងឃ្មុំ', aliases: ['tboung khmum', 'សួង'] },
  { name: 'មណ្ឌលគិរី', aliases: ['mondulkiri'] },
  { name: 'រតនគិរី', aliases: ['ratanakiri'] },
  { name: 'ព្រះវិហារ', aliases: ['preah vihear'] },
  { name: 'ស្ទឹងត្រែង', aliases: ['stung treng'] },
  { name: 'ឧត្តរមានជ័យ', aliases: ['oddar meanchey', 'សំរោង'] },
  { name: 'ប៉ៃលិន', aliases: ['pailin'] },
  { name: 'កែប', aliases: ['kep'] },
  { name: 'កណ្តាល', aliases: ['kandal', 'កណ្ដាល'] }
];

// ៧. ក្រុមហ៊ុនដឹកជញ្ជូន និងឡានក្រុងតាមខេត្ត (Provincial Couriers & Transport)
export const PROVINCIAL_COURIERS = [
  'វីរៈប៊ុនថាំ', 'វីរះប៊ុនថាំ', 'វិរៈប៊ុនថាំ', 'វីរៈប៊ុនថាំង', 'វិរះប៊ុនថាំ', 'វីរៈ', 'វីរះ',
  'vireak buntham', 'vireak', 'vet express', 'v.e.t',
  'កាពីតូល', 'capitol', 'កាពីតុល',
  'សូរិយា', 'sorya express', 'sorya 168',
  'រិទ្ធិមុនី', 'រិទ្ធមុនី', 'rithy mony', 'rith mony',
  'ឡារីតា', 'larryta',
  'ជែមស៍', 'james express',
  'ហ្គោលដេន', 'golden express',
  'ជីនតុង', 'ជិនតុង', 'jin tong',
  'ស៊ិនស៊ីសាន', 'ស៊ីនស៊ីសាន',
  'វឌ្ឍនៈ', 'wattanac express',
  'ឡានឈ្នួល', 'ឡានក្រុង', 'ផ្ញើតាមឡាន', 'ផ្ញើឡាន', 'ផ្ញើតាមខេត្ត', 'តាមខេត្ត', 'ផ្ញើខេត្ត', 'ផ្ញើរខេត្ត', 'តាមឡាន',
  'បេនឡាន', 'បេនភ្នំពេញ', 'ឡានភ្នំពេញ', 'ផ្ញើវីរៈ', 'ផ្ញើវីរះ', 'ផ្ញើកាពីតូល',
  'j&t', 'jt express', 'j&t express', 'kerry express', 'kerry', 'zto express', 'flash express', 'ce express'
];

/**
 * Clean and normalize text: removes invisible zero-width chars and converts Khmer digits to Arabic
 */
export function cleanText(text: string): string {
  if (!text) return '';
  return text
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, ' ')
    .replace(/[០-៩]/g, ch => ({ '០': '0', '១': '1', '២': '2', '៣': '3', '៤': '4', '៥': '5', '៦': '6', '៧': '7', '៨': '8', '៩': '9' }[ch] || ch))
    .trim();
}

// Generate normalized versions of all PP keywords with both Khmer & Arabic digit variations
function generateAllPPKeywords(): string[] {
  const set = new Set<string>();
  const rawList = [
    ...PP_KHANS,
    ...PP_SANGKATS_AND_AREAS,
    ...PP_BOREYS,
    ...PP_LANDMARKS_AND_ROADS,
    ...GREATER_PP_AREAS
  ];

  for (const item of rawList) {
    if (!item) continue;
    set.add(item);
    const cleaned = cleanText(item);
    if (cleaned) set.add(cleaned);
  }

  return Array.from(set).sort((a, b) => b.length - a.length);
}

// Combine all Phnom Penh keywords into a sorted list (longest first to match specific before generic)
const ALL_PP_KEYWORDS = generateAllPPKeywords();

// Canonical name normalization
const canonicalNameMap: Record<string, string> = {
  'ពោចិនតុង': 'ពោធិ៍សែនជ័យ / ពោធិ៍ចិនតុង',
  'ពោធិចិនតុង': 'ពោធិ៍សែនជ័យ / ពោធិ៍ចិនតុង',
  'ជេីងឯក': 'ជើងឯក',
  'ព្រែកលាប': 'ព្រែកលៀប',
  'ព្រែបលាប': 'ព្រែកលៀប',
  'សំណង១២': 'សំណង់១២',
  'សំណង12': 'សំណង់១២',
  'សំណង់12': 'សំណង់១២',
  'ចេាមចៅ': 'ចោមចៅ',
  'បឹងទំពន់': 'បឹងទំពុន',
  'ចាក់អង្រែលើ': 'ចាក់អង្រែលើ',
  'ចាក់អង្រែក្រោម': 'ចាក់អង្រែក្រោម',
  'ផ្លូវ2004': 'ផ្លូវ 2004',
  'ផ្លូវ271': 'ផ្លូវ 271',
  'ផ្លូវ371': 'ផ្លូវ 371',
  'ផ្លូវ598': 'ផ្លូវ 598',
  'ផ្លូវ217': 'ផ្លូវ 217',
  'ផ្លូវ60ម៉ែត្រ': 'ផ្លូវ 60ម៉ែត្រ',
  'ផ្សារកណ្ដាល': 'ផ្សារកណ្តាល',
  'អូរឬស្សី': 'អូរឫស្សី'
};

/**
 * Deep sanitization for address extraction:
 * Strips phone numbers, product codes with quantities and sizes (e.g. 24=1L, 20=, 23=1, 15=1, 8M, 24=3 SML),
 * clothing types, color notes, measurements (160m, 50kg), asterisks, and customer questions.
 */
export function cleanAddressInput(raw: string): string {
  if (!raw) return '';
  let s = cleanText(raw);

  // 1. Phone numbers:
  // Cambodian phone numbers: 0 + 8 or 9 digits (01x, 06x, 07x, 08x, 09x, 03x) with optional spaces/dashes
  s = s.replace(/(?:(?:\+?855[\s.\-()]*|0)[1-9](?:[\s.\-()]*\d){7,8}(?!\d))|(?:លេខ\s*0\d{8,9})|(?:\b0\d{8,9}\b)/gi, ' ');

  // 2. Product codes with assignments, quantities, or symbols:
  // e.g. 20=, 20=1, 23=1, 24=1L, 15=1, 8M, 14x1, 20x1, 24=3 SML, 20=************, 20=1/L, 21=1/kg50, កូត10=1, etc.
  s = s.replace(/(?:(?<=[^\w\u1780-\u17D2]|^)[A-Za-z0-9]{1,5}\s*[:=/\-_*xX»]+\s*[\*\-_=A-Za-z0-9]*)/gi, ' ');
  s = s.replace(/(?:បង|ចែ|អូន|admin)?\s*(?:យក|ថែម|ដាក់|កក់|បូក|សុំ|កាត់)?\s*(?:កូដ|កូត|code|ម៉ូត)\s*\[?\s*[A-Za-z0-9]*\s*\]?(?:\s*[:=/\-_*xX»]\s*[A-Za-z0-9]*)?/gi, ' ');
  s = s.replace(/\b(?:កូដ|កូត|code|ម៉ូត)\b/gi, ' ');

  // 3. Sizes & measurements (e.g. XXS..6XL, S, M, L, FS, 75kg, 160m)
  s = s.replace(/\b(?:XXS|XXL|6XL|5XL|4XL|3XL|2XL|XL|XS|[SML]|FS|FREESIZE)\b/gi, ' ');
  s = s.replace(/\b\d{1,3}\s*(?:kg|kilo|គីឡូ|គឺឡូ|កីឡូ|cm|m|ម៉ែត្រ)\b/gi, ' ');

  // 4. Action phrases (e.g. យក 22, ថែម 33, បងយក, កាត់) - Safeguard 'សង្កាត់'!
  s = s.replace(/(?:(?<=^|\s)(?:បង|ចែ|អូន)?\s*(?:យក|ថែម|ដាក់|កក់|បូក|សុំ)|(?<!សង្)កាត់)(?=\s|$|[0-9])/gi, ' ');
  s = s.replace(/^(?:បង|ចែ|អូន|admin)\s+/gi, ' ');

  // 5. Khmer quantity phrases
  s = s.replace(/(?:មួយ|ពី|ពីរ|បី|បួន|ប្រាំ|1|2|3|4|5)\s*(?:អាវ|ខោ|ឈុត|ឆុត|រ៉ូប|សំពត់|កំប៉ុង|កញ្ចប់|គូ)/gi, ' ');
  s = s.replace(/\b(?:មួយ|ពីរ|បី|បួន|ប្រាំ)\s*(?:មុខ|កំរង|ឈុត|អាវ|ខោ)\b/gi, ' ');

  // 6. Colors
  s = s.replace(/(?:ពណ៍|ពណ៌|ពណ៏|ពណ)\s*[\u1780-\u17D2a-zA-Z0-9]+/gi, ' ');
  s = s.replace(/\b(?:ពណ៌|ពណ៍|ពណ៏|ពណ)?\s*(?:សរ?|ខ្មៅ|ក្រហម|ខៀវ|លឿង|ផ្កាឈូក|ស្វាយ|បៃតង|ត្នោត|ប្រផេះ|ទឹកដោះគោ|សូកូឡា|កាហ្វេ|ឈាមជ្រូក|ផ្ទៃមេឃ|ត្រួយចេក|បែកផ្សែង|ការ៉ុត|ទឹកក្រូច|កាពិ)\b/gi, ' ');

  // 7. Clothing types
  s = s.replace(/\b(?:ខោជើងប៉ាត|ខោជើងវែង|ខោជើងខ្លី|ខោ|អាវ|សំពត់|ឈុត|ឆុត|រ៉ូប|កាបូប|ស្បែកជើង)\b/gi, ' ');

  // 8. Questions & chat phrases
  s = s.replace(/(?:ពាក់បានអត់|ពាក់បានទេ|ពាក់បាន|ស្លៀកបាន|មានអត់|អស់នៅ|អស់ហើយ|លក់ម៉េច|ប៉ុន្មាន|សុំមើល|លើកអាវ|លើកខោ|សាច់ស្អាត|សួស្តី|ជម្រាបសួរ|អរគុណ|admin|ok|yes|no)/gi, ' ');

  // 9. Clean symbols, asterisks, brackets (leave slashes / dashes for addresses like 12/A or 12-A)
  s = s.replace(/[\*#@!~^%_+=:;\\|()\[\]]+/g, ' ')
       .replace(/^[,\s.:;=()\-]+|[,\s.:;=()\-]+$/g, '')
       .replace(/\s{2,}/g, ' ')
       .trim();

  return s;
}

/**
 * Strips any leftover stray product code traces from a candidate location
 */
function postCleanLocation(loc: string): string {
  if (!loc) return '';
  let s = loc
    .replace(/(?:(?<=[^\w\u1780-\u17D2]|^)[A-Za-z0-9]{1,5}\s*[:=/\-_*xX»]+\s*[\*\-_=A-Za-z0-9]*)/gi, ' ')
    .replace(/\b(?:XXS|XXL|6XL|5XL|4XL|3XL|2XL|XL|XS|[SML]|FS|FREESIZE)\b/gi, ' ')
    .replace(/[\*#@!~^%_+=:;\\|\[\]]+/g, ' ')
    .replace(/^[,\s.:;=\-]+|[,\s.:;=\-]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // If opening parenthesis exists without closing, close it
  const openCount = (s.match(/\(/g) || []).length;
  const closeCount = (s.match(/\)/g) || []).length;
  if (openCount > closeCount) {
    s += ')';
  } else if (closeCount > openCount) {
    s = s.replace(/\)$/, '');
  }

  return s;
}

/**
 * Extracts a complete address clause around a detected keyword
 */
function extractFullAddressSentence(text: string, matchedKeyword: string): string {
  const norm = cleanText(text);
  if (!norm) return matchedKeyword;

  const canonical = canonicalNameMap[matchedKeyword] || matchedKeyword;

  // Clean the text from any product codes, phone numbers, colors, sizes, or chat phrases
  const sanitized = cleanAddressInput(norm);
  if (!sanitized) return canonical;

  const cleanMatched = cleanText(matchedKeyword);

  // If text after cleaning is already concise and contains matchedKeyword, check if it's a clean address phrase
  if (sanitized.includes(cleanMatched) || sanitized.includes(matchedKeyword)) {
    // 1. If sanitized string is a concise address sentence (under 16 words and no order symbols)
    const words = sanitized.split(/\s+/).filter(Boolean);
    if (words.length <= 16 && !/(?:=|\bkilo\b|\bkg\b|\bcode\b|កូដ|កូត)/i.test(sanitized)) {
      const cleaned = postCleanLocation(sanitized);
      if ((cleaned.includes(cleanMatched) || cleaned.includes(matchedKeyword)) && cleaned.length >= cleanMatched.length) {
        return cleaned;
      }
    }

    // 2. Otherwise extract full contiguous address block around the keyword
    const targetPatternWord = (sanitized.includes(cleanMatched) ? cleanMatched : matchedKeyword).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const segmentPattern = new RegExp(
      '(?:(?:ផ្ទះ|ផ្លូវ|បុរី|សង្កាត់|ខណ្ឌ|ក្រុង|ស្រុក|ភូមិ|ឃុំ|ផ្សារ|ម្តុំ|ជិត|ក្បែរ|ទល់មុខ|ក្រោយ|ខាង|បន្ទប់|អគារ|ជាន់ទី)[^\n\r,;|]*?)?' +
      targetPatternWord +
      '(?:[^\n\r,;|]*?(?:ភ្នំពេញ|ខេត្ត|ក្រុង|ស្រុក|ខណ្ឌ|សង្កាត់|ផ្លូវ|ផ្ទះ|បុរី|បន្ទប់|[A-Za-z0-9]+))?',
      'i'
    );
    const m = sanitized.match(segmentPattern);
    if (m && m[0] && m[0].trim().length >= cleanMatched.length) {
      const candidate = postCleanLocation(m[0].trim());
      if (candidate.length >= cleanMatched.length && !/(?:=|\bkilo\b|\bkg\b)/i.test(candidate)) {
        return candidate;
      }
    }
  }

  return canonical;
}

/**
 * ⚡ HIGH-PRECISION LOCATION & DELIVERY ZONE DETECTOR
 *
 * App Focus (Based on user request):
 * 1. 100% precision capture of all Phnom Penh (PP) locations (14 Khans, 105 Sangkats, Boreys, Roads, Landmarks).
 * 2. If it's outside Phnom Penh or a customer mentions a province / courier, neatly filter it into PROVINCE ('🏞️ តាមខេត្ត').
 * 3. Provincial micro-districts removed to keep the regex razor-sharp for Phnom Penh detection.
 */
export function detectDeliveryZone(text: string): DeliveryZoneResult {
  if (!text || !text.trim()) {
    return { zone: 'PROVINCE', label: '🏞️ តាមខេត្ត', hasExplicitLocation: false, detectedLocation: '🏞️ តាមខេត្ត' };
  }

  const normalized = cleanText(text);
  const lower = normalized.toLowerCase();

  // -------------------------------------------------------------------------
  // STEP 1: CONTEXTUAL DISAMBIGUATION FOR PHNOM PENH
  // -------------------------------------------------------------------------
  const isSamraongPP = /សំរោងក្រោម|សំរោង\s*ព្រែកព្នៅ|ព្រែកព្នៅ\s*សំរោង|សង្កាត់សំរោង|សំរោងអណ្តែត|សំរោងអណ្ដែត/i.test(normalized);
  const isPreyVengPP = /ខណ្ឌដង្កោ[\s\S]*ព្រៃវែង|ដង្កោ[\s\S]*ព្រៃវែង|សង្កាត់ព្រៃវែង\s*(?:ខណ្ឌ)?ដង្កោ/i.test(normalized);
  const isPhsarKandalPP = /ផ្សារកណ្តាល|ផ្សារកណ្ដាល|សង្កាត់ផ្សារកណ្តាល/i.test(normalized);

  if (isSamraongPP || isPreyVengPP || isPhsarKandalPP) {
    const kw = isSamraongPP ? 'សំរោង' : isPreyVengPP ? 'សង្កាត់ព្រៃវែង' : 'ផ្សារកណ្តាល';
    const fullAddr = extractFullAddressSentence(normalized, kw);
    return {
      zone: 'PP',
      label: '🏙️ ភ្នំពេញ',
      detectedLocation: postCleanLocation(fullAddr),
      matchedKeyword: kw,
      hasExplicitLocation: true
    };
  }

  // -------------------------------------------------------------------------
  // STEP 2: CHECK FOR EXPLICIT PHNOM PENH GEOGRAPHY (100% HIGH PRECISION)
  // -------------------------------------------------------------------------
  // Scan ALL Phnom Penh specific locations, Sangkats, Khans, Boreys, and Roads
  for (const loc of ALL_PP_KEYWORDS) {
    const locLower = loc.toLowerCase();
    const locClean = cleanText(locLower);
    if (lower.includes(locLower) || lower.includes(locClean)) {
      const canonical = canonicalNameMap[loc] || loc;
      const fullAddr = extractFullAddressSentence(normalized, loc);
      return {
        zone: 'PP',
        label: '🏙️ ភ្នំពេញ',
        detectedLocation: postCleanLocation(fullAddr || canonical),
        matchedKeyword: loc,
        hasExplicitLocation: true
      };
    }
  }

  // Generic Phnom Penh keywords
  const genericPP = [
    'ភ្នំពេញ', 'phnom penh', 'phnompenh', 'ppenh', 'រាជធានី', 'ក្នុងក្រុង', 'ក្នុក្រុង', 'ក្រុងភ្នំពេញ', 'នៅពេញ',
    'ដឹកដល់ផ្ទះ', 'grab', 'nham24', 'foodpanda', 'lalamove', 'tada', 'passapp'
  ];

  for (const kw of genericPP) {
    if (kw === 'pp') {
      if (/(?:^|[^a-z0-9])pp(?:[^a-z0-9]|$)/i.test(lower)) {
        return { zone: 'PP', label: '🏙️ ភ្នំពេញ', detectedLocation: 'ភ្នំពេញ', matchedKeyword: 'pp', hasExplicitLocation: true };
      }
      continue;
    }
    if (lower.includes(kw)) {
      return {
        zone: 'PP',
        label: '🏙️ ភ្នំពេញ',
        detectedLocation: postCleanLocation(extractFullAddressSentence(normalized, kw) || 'ភ្នំពេញ'),
        matchedKeyword: kw,
        hasExplicitLocation: true
      };
    }
  }

  // Structured address patterns in Phnom Penh: ផ្ទះ, ផ្លូវ, សង្កាត់, ខណ្ឌ, បុរី
  const ppStructuredPatterns = [
    /(?:ផ្ទះ\s*(?:លេខ|№)?\s*\d+[a-z]?[\s\S]*?(?:ផ្លូវ|សង្កាត់|ខណ្ឌ|ភ្នំពេញ))/i,
    /(?:ផ្លូវ\s*(?:លេខ)?\s*\d+[a-z]?[\s\S]*?(?:ផ្ទះ|សង្កាត់|ខណ្ឌ|ភ្នំពេញ))/i,
    /បុរី\s*[\u1780-\u17FFa-zA-Z0-9_\s]+/i,
    /សង្កាត់\s*[\u1780-\u17FFa-zA-Z0-9_\s]+/i,
    /ខណ្ឌ\s*[\u1780-\u17FFa-zA-Z0-9_\s]+/i,
    /ផ្លូវ\s*(?:លេខ)?\s*\d{1,4}[A-Za-z]?\b/i
  ];

  for (const pat of ppStructuredPatterns) {
    const m = normalized.match(pat);
    if (m && m[0] && m[0].trim().length >= 4) {
      const fullAddr = extractFullAddressSentence(normalized, m[0].trim());
      return {
        zone: 'PP',
        label: '🏙️ ភ្នំពេញ',
        detectedLocation: postCleanLocation(fullAddr),
        matchedKeyword: m[0].trim(),
        hasExplicitLocation: true
      };
    }
  }

  // -------------------------------------------------------------------------
  // STEP 3: ALL OTHER CASES ARE CLEANLY CATEGORIZED AS PROVINCE ('🏞️ តាមខេត្ត')
  // -------------------------------------------------------------------------

  // A. Check for Provincial Couriers / Express
  for (const courier of PROVINCIAL_COURIERS) {
    if (courier === 'vet' || courier === 'ce') {
      const re = new RegExp(`(?:^|\\s|ផ្ញើ|ក្រុមហ៊ុន)${courier}(?:\\s|$|express)`, 'i');
      if (re.test(lower)) {
        return {
          zone: 'PROVINCE',
          label: '🏞️ តាមខេត្ត',
          detectedLocation: courier,
          matchedKeyword: courier,
          hasExplicitLocation: true
        };
      }
      continue;
    }

    if (lower.includes(courier.toLowerCase())) {
      return {
        zone: 'PROVINCE',
        label: '🏞️ តាមខេត្ត',
        detectedLocation: courier,
        matchedKeyword: courier,
        hasExplicitLocation: true
      };
    }
  }

  // B. Check 24 Clean Province Names
  for (const prov of PROVINCES_MAP) {
    if (lower.includes(prov.name.toLowerCase())) {
      return {
        zone: 'PROVINCE',
        label: '🏞️ តាមខេត្ត',
        detectedLocation: prov.name,
        matchedKeyword: prov.name,
        hasExplicitLocation: true
      };
    }

    // Check province aliases (e.g. 'sr', 'btb', 'kampong som')
    for (const alias of prov.aliases) {
      if (alias.length <= 3) {
        const re = new RegExp(`(?:^|[^a-z0-9])${alias}(?:[^a-z0-9]|$)`, 'i');
        if (re.test(lower)) {
          return {
            zone: 'PROVINCE',
            label: '🏞️ តាមខេត្ត',
            detectedLocation: prov.name,
            matchedKeyword: alias,
            hasExplicitLocation: true
          };
        }
      } else if (lower.includes(alias.toLowerCase())) {
        return {
          zone: 'PROVINCE',
          label: '🏞️ តាមខេត្ត',
          detectedLocation: prov.name,
          matchedKeyword: alias,
          hasExplicitLocation: true
        };
      }
    }
  }

  // C. Provincial patterns (ឃុំ, ស្រុក, ភូមិ, ខេត្ត)
  const provStructuredPatterns = [
    /ខេត្ត\s*[\u1780-\u17FFa-zA-Z0-9_\s]+/i,
    /ស្រុក\s*[\u1780-\u17FFa-zA-Z0-9_\s]+/i,
    /ឃុំ\s*[\u1780-\u17FFa-zA-Z0-9_\s]+/i,
    /ភូមិ\s*[\u1780-\u17FFa-zA-Z0-9_\s]+/i
  ];

  for (const pat of provStructuredPatterns) {
    const m = normalized.match(pat);
    if (m && m[0] && m[0].trim().length >= 4) {
      return {
        zone: 'PROVINCE',
        label: '🏞️ តាមខេត្ត',
        detectedLocation: m[0].trim(),
        matchedKeyword: m[0].trim(),
        hasExplicitLocation: true
      };
    }
  }

  // -------------------------------------------------------------------------
  // STEP 4: DEFAULT FALLBACK (No explicit location found -> ALWAYS PROVINCE)
  // "ក្រៅពីភ្នំពេញដាក់ filter ខេត្តទៅ"
  // -------------------------------------------------------------------------
  return {
    zone: 'PROVINCE',
    label: '🏞️ តាមខេត្ត',
    detectedLocation: '🏞️ តាមខេត្ត',
    hasExplicitLocation: false
  };
}

/**
 * Detects if a text string is a customer question, garment chatter, or live host request
 */
export function isQuestionOrLiveChatter(text: string): boolean {
  if (!text) return false;
  const s = text.trim();
  if (!s) return false;

  // 1. Live requests / chatter patterns (e.g. "បងមានសំពត់ក្មេងអត់", "ចែលើកសំពត់ផង", "បង16មានពណ៌តើអីបង", "បងលើកឈុតគេង")
  if (/(?:បងមាន|ចែមាន|អូនមាន|មានសំពត់|មានអាវ|មានខោ|មានឈុត|មានឆុត|មានរ៉ូប|មានពណ៌|មានពណ៍|ពណ៌អី|ពណ៍អី|ពណ៌តើអី|ពណ៍តើអី|សំពត់ក្មេង|ក្មេងអត់|សំពត់ផង|លើកសំពត់|លើកអាវ|លើកខោ|លើកឈុត|លើកឆុត|លើកមើល|សុំមើល|សុំលើក|បងលើក|ចែលើក|អូនលើក|ឈុតគេង|សាច់ស្អាត|ពាក់បាន|ស្លៀកបាន|លក់ម៉េច|ប៉ុន្មាន|ប៉ុន្មានលុយ|ថ្លៃប៉ុន្មាន|អស់នៅ|អស់ហើយ|សួស្តី|ជម្រាបសួរ|អរគុណ)/i.test(s)) {
    return true;
  }

  // 2. Question marks or typical question endings
  if (s.includes('?') || /(?:អត់|ទេ|នៅ\?|លក់ម៉េច|ប៉ុន្មាន|ផង|ណា៎|ណាបង|ណា\?|តើអី|អីបង|អីចែ|អត់បង|អត់ចែ)$/i.test(s)) {
    // If it also does not contain an explicit address keyword like ផ្ទះ, ផ្លូវ, ផ្សារ, បុរី, សង្កាត់, ខណ្ឌ, ក្រុង, ស្រុក, ខេត្ត
    if (!/(?:ផ្ទះ|ផ្លូវ|សង្កាត់|ខណ្ឌ|ក្រុង|ស្រុក|ខេត្ត)\s*[\u1780-\u17D2a-zA-Z0-9]+/i.test(s)) {
      return true;
    }
  }

  // 3. Live host interaction commands
  if (/^(?:បង|ចែ|អូន)\s*(?:លើក|មាន|សុំ|បង្ហាញ|សុំមើល|លក់|ជួយ)/i.test(s)) {
    return true;
  }

  return false;
}

/**
 * Extracts clean address text from comment by removing product codes, phone numbers, and action words
 */
export function extractCleanAddressFromComment(rawComment: string): string | null {
  if (!rawComment || !rawComment.trim()) return null;

  // Strict guard: if comment is a question or garment chatter or live request, RETURN NULL IMMEDIATELY!
  if (isQuestionOrLiveChatter(rawComment)) {
    return null;
  }

  const s = cleanAddressInput(rawComment);
  if (!s || s.length < 2) return null;

  // Check if cleaned string is a question or chatter
  if (isQuestionOrLiveChatter(s)) {
    return null;
  }

  const res = detectDeliveryZone(s);
  if (res.hasExplicitLocation && res.detectedLocation) {
    const cleanLoc = postCleanLocation(res.detectedLocation);
    if (cleanLoc.length >= 2 && !isQuestionOrLiveChatter(cleanLoc) && !/(?:=|\bkilo\b|\bkg\b)/i.test(cleanLoc)) {
      return canonicalNameMap[cleanLoc] || cleanLoc;
    }
  }

  return null;
}

/**
 * Checks if a comment is purely contact info (phone/address) or customer chat inquiry,
 * with NO product order intent.
 */
export function isPureContactOrInquiryComment(text: string): boolean {
  if (!text) return true;
  const s = text.trim();
  if (!s) return true;

  // 1. Phone numbers: if comment is purely a Cambodian phone number (e.g. 012345678, លេខ016285098, 099 942032)
  const phoneOnly = s
    .replace(/(?:(?:\+?855[\s.\-()]*|0)[1-9](?:[\s.\-()]*\d){7,8}(?!\d))|(?:លេខ\s*0\d{8,9})|(?:\b0\d{8,9}\b)/gi, '')
    .replace(/^(?:លេខ|phone|tell?|tel|hp|phone\s*number)?:?\s*/i, '')
    .replace(/[\s\-_.,/]+/g, '');
  if (phoneOnly.length === 0) {
    return true;
  }

  // 2. Chat inquiries & questions (e.g. "បងមានសំពត់ក្មេងអត់", "ចែលើកសំពត់ផង", "ខោជើងប៉ាតនិង160mពាក់បានអត់បង", "សួស្តី", "សុំមើល", "លក់ម៉េច", "ប៉ុន្មាន")
  if (isQuestionOrLiveChatter(s)) {
    return true;
  }

  // 3. Pure location comments without order intent (e.g. "ផ្សារព្រៃឯង", "ចោមចៅ", "បែកចាន", "ទួលគោក", "សៀមរាប", "តាកែវ")
  const hasOrderPattern = /(?:(?<=[^\w\u1780-\u17D2]|^)[A-Za-z0-9]{1,5}\s*[:=/\-_*xX»]+\s*[\*\-_=A-Za-z0-9]*)|(?:(?:យក|កាត់|ថែម|ដាក់|កក់)\s*(?:កូដ|code)?[A-Za-z0-9]{1,5})/i.test(s);
  if (!hasOrderPattern) {
    if (/(?:ផ្សារ|បុរី|សង្កាត់|ខណ្ឌ|ក្រុង|ស្រុក|ភូមិ|ភ្នំពេញ|ចោមចៅ|ទឹកថ្លា|បែកចាន|ទួលគោក|ដង្កោ|សៀមរាប|បាត់ដំបង|កំពង់ចាម|កំពង់ស្ពឺ|តាកែវ|កំពត|ព្រៃវែង|ស្វាយរៀង|វីរៈប៊ុនថាំ|j&t|flash|តាខ្មៅ)/i.test(s)) {
      return true;
    }
  }

  return false;
}
