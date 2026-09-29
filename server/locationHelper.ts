import { DeliveryZone } from './types';

export interface DeliveryZoneResult {
  zone: DeliveryZone;
  label: string;
  detectedLocation?: string;
  matchedKeyword?: string;
  hasExplicitLocation?: boolean;
}

// =========================================================================
// 🗺️ CAMBODIAN GEOGRAPHY KNOWLEDGE BASE
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
  'ខណ្ឌពោធិ៍សែនជ័យ', 'ខណ្ឌពោធសែនជ័យ', 'ខណ្ឌពោធិសែនជ័យ', 'ពោធិ៍សែនជ័យ', 'ពោធសែនជ័យ', 'ពោធិសែនជ័យ', 'pou senchey', 'porsenchey',
  'ខណ្ឌច្បារអំពៅ', 'ច្បារអំពៅ', 'chbar ampov', 'chbarampov',
  'ខណ្ឌជ្រោយចង្វារ', 'ខណ្ឌជ្រោយចង្វា', 'ជ្រោយចង្វារ', 'ជ្រោយចង្វា', 'chroy changvar', 'chroychangvar',
  'ខណ្ឌព្រែកព្នៅ', 'ព្រែកព្នៅ', 'prek pnov', 'prekpnov',
  'ខណ្ឌបឹងកេងកង', 'បឹងកេងកង', 'boeung keng kang', 'bkk',
  'ខណ្ឌកំបូល', 'កំបូល', 'kamboul', 'kombol'
];

// ២. សង្កាត់ទាំង ១០៥ និងតំបន់ល្បីៗនៅភ្នំពេញ (Phnom Penh Sangkats & Quarters)
export const PP_SANGKATS_AND_AREAS = [
  // ដូនពេញ
  'ផ្សារថ្មីទី១', 'ផ្សារថ្មីទី 1', 'ផ្សារថ្មី១', 'ផ្សារថ្មី1',
  'ផ្សារថ្មីទី២', 'ផ្សារថ្មីទី 2', 'ផ្សារថ្មី២', 'ផ្សារថ្មី2',
  'ផ្សារថ្មីទី៣', 'ផ្សារថ្មីទី 3', 'ផ្សារថ្មី៣', 'ផ្សារថ្មី3', 'ផ្សារថ្មី', 'ផ្សារធំថ្មី',
  'បឹងរាំង', 'ផ្សារកណ្តាលទី១', 'ផ្សារកណ្តាលទី១', 'ផ្សារកណ្តាល១', 'ផ្សារកណ្តាល1',
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
  'បឹងត្របែក', 'ផ្សារបឹងត្របែក', 'ផ្សារដើមថ្កូវ', 'ផ្សារកាប់គោ',

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
  'គីឡូម៉ែត្រលេខ៦', 'គីឡូម៉ែត្រលេខ ៦', 'គីឡូម៉ែត្រ៦', 'គីឡូម៉ែត្រ6', 'គីឡូ៦', 'គីឡូ 6',
  'ទួលសង្កែទី១', 'ទួលសង្កែទី 1', 'ទួលសង្កែ១', 'ទួលសង្កែ1',
  'ទួលសង្កែទី២', 'ទួលសង្កែទី 2', 'ទួលសង្កែ២', 'ទួលសង្កែ2',
  'ទួលសង្កែ', 'tuol sangke', 'ផ្សារទួលសង្កែ',
  'ស្វាយប៉ាក', 'ច្រាំងចំរេះទី១', 'ច្រាំងចំរេះ១', 'ច្រាំងចំរេះទី២', 'ច្រាំងចំរេះ២', 'ច្រាំងចំរេះ',
  'គួចកាណុង', 'ស្ពានបាឡេ', 'គីឡូលេខ១០', 'គីឡូលេខ10', 'ផ្សារគីឡូលេខ៤', 'ផ្សារគីឡូ៤',

  // សែនសុខ
  'ភ្នំពេញថ្មី', 'ទឹកថ្លា', 'ផ្សារទឹកថ្លា', 'ឃ្មួញ', 'ក្រាំងធ្នង់', 'អូរបែកក្អម', 'គោកឃ្លាង',
  'ឈូកមាស', 'ផ្សារឈូកមាស',
  'ឈូកវ៉ាទី១', 'ឈូកវ៉ាទី 1', 'ឈូកវ៉ាទី1', 'ឈូកវ៉ា១', 'ឈូកវ៉ា1',
  'ឈូកវ៉ាទី២', 'ឈូកវ៉ាទី 2', 'ឈូកវ៉ាទី2', 'ឈូកវ៉ា២', 'ឈូកវ៉ា2', 'ឈូកវ៉ា', 'ឈូករ៉ាពី', 'ឈូករា៉ពី',
  'ផ្សារដីហុយ', 'សឡា', 'ផ្សារសឡា', 'ផ្សារបឹងបៃតង',

  // មានជ័យ
  'ចាក់អង្រែលើ', 'ចាក់អង្រែក្រោម', 'ចាក់អង្រែ', 'ផ្សារចាក់អង្រែ',
  'ស្ទឹងមានជ័យទី១', 'ស្ទឹងមានជ័យទី 1', 'ស្ទឹងមានជ័យ១', 'ស្ទឹងមានជ័យ1',
  'ស្ទឹងមានជ័យទី២', 'ស្ទឹងមានជ័យទី 2', 'ស្ទឹងមានជ័យ២', 'ស្ទឹងមានជ័យ2',
  'ស្ទឹងមានជ័យទី៣', 'ស្ទឹងមានជ័យទី 3', 'ស្ទឹងមានជ័យ៣', 'ស្ទឹងមានជ័យ3',
  'ស្ទឹងមានជ័យចាស់', 'ស្ទឹងមានជ័យថ្មី', 'ផ្សារស្ទឹងមានជ័យចាស់', 'ផ្សារស្ទឹងមានជ័យថ្មី', 'ផ្សារស្ទឹងមានជ័យ', 'ស្ទឹងមានជ័យ',
  'បឹងទំពុនទី១', 'បឹងទំពុនទី 1', 'បឹងទំពុន១', 'បឹងទំពុន1',
  'បឹងទំពុនទី២', 'បឹងទំពុនទី 2', 'បឹងទំពុន២', 'បឹងទំពុន2',
  'បឹងទំពុន', 'បឹងទំពន់', 'ក្បាលថ្នល់', 'ផ្សារដីថ្មី', 'ដីថ្មី', 'ផ្សារហេងលី', 'វត្តសន្សំកុសល', 'ផ្សារpc',
  'លូប្រាំ', 'លូ៥', 'លូបី', 'លូ៣', 'លូបួន', 'លូ៤', 'ផ្សារលូប្រាំ',

  // ពោធិ៍សែនជ័យ & កំបូល
  'ចោមចៅទី១', 'ចោមចៅទី 1', 'ចោមចៅទី1', 'ចោមចៅ១', 'ចោមចៅ1',
  'ចោមចៅទី២', 'ចោមចៅទី 2', 'ចោមចៅទី2', 'ចោមចៅ២', 'ចោមចៅ2',
  'ចោមចៅទី៣', 'ចោមចៅទី 3', 'ចោមចៅទី3', 'ចោមចៅ៣', 'ចោមចៅ3',
  'ចោមចៅ', 'ចេាមចៅ',
  'កាកាបទី១', 'កាកាបទី 1', 'កាកាបទី1', 'កាកាប១', 'កាកាប1',
  'កាកាបទី២', 'កាកាបទី 2', 'កាកាបទី2', 'កាកាប២', 'កាកាប2', 'កាកាប',
  'ត្រពាំងក្រសាំង', 'សំរោងក្រោម', 'វត្តជន្លង់ម្លូ', 'ជន្លង់ម្លូ',
  'កន្ទោក', 'ភ្លើងឆេះរទេះ', 'បឹងធំ', 'ស្នោរ',
  'ផ្សារត្រពាំងថ្លឹង', 'ត្រពាំងថ្លឹង', 'ផ្សារកាណាឌីយ៉ា', 'កាណាឌីយ៉ា', 'canadia',
  'វេងស្រេង', 'វ៉េងស្រេង', 'veng sreng', 'vengsreng',
  'ពោធិ៍ចិនតុង', 'ពោធិចិនតុង', 'ពោចិនតុង', 'pochentong',
  'ព្រលានយន្តហោះ', 'ព្រលាន', 'ផ្សារស៊ិនជូរី', 'ផ្សារសេនជូរី', 'ស៊ិនជូរី', 'សេនជូរី', 'century plaza',
  'ផ្សារជម្ពូវ័ន', 'ជម្ពូវ័ន',

  // ច្បារអំពៅ
  'ច្បារអំពៅទី១', 'ច្បារអំពៅទី 1', 'ច្បារអំពៅ១', 'ច្បារអំពៅ1',
  'ច្បារអំពៅទី២', 'ច្បារអំពៅទី 2', 'ច្បារអំពៅ២', 'ច្បារអំពៅ2',
  'ច្បារអំពៅ', 'ផ្សារច្បារអំពៅ', 'chbar ampov',
  'និរោធ', 'ព្រែកប្រា', 'ព្រែកឯង', 'ព្រែកថ្មី', 'ក្បាលកោះ', 'វាលស្បូវ',

  // ជ្រោយចង្វារ
  'ជ្រោយចង្វារ', 'ជ្រោយចង្វា', 'chroy changvar',
  'ព្រែកលៀប', 'ព្រែបលាប', 'ព្រែកលាប', 'prek leap', 'ព្រែកតាសេក', 'កោះដាច់', 'បាក់ខែង',
  'វិមានឈ្នះឈ្នះ', 'ស្តាតមរតកតេជោ', 'ស្ពានជ្រោយចង្វារ',

  // ព្រែកព្នៅ
  'ព្រែកព្នៅ', 'prek pnov', 'ពញាពន់', 'គោករកា', 'ពន្សាំង', 'ផ្សារព្រែកព្នៅ',

  // ដង្កោ
  'ដង្កោ', 'dangkao', 'dangkor',
  'ព្រៃស', 'ព្រៃ ស', 'ស្តុបព្រៃស', 'សង្កាត់ព្រៃស',
  'ជើងឯក', 'ជេីងឯក', 'ពងទឹក', 'ក្រាំងពង្រ', 'សាក់សំពៅ', 'ទៀន', 'គងនយ',
  'សង្កាត់ព្រៃវែង', 'ដង្កោ ព្រៃវែង'
];

// ៣. បុរី និងគម្រោងលំនៅឋានល្បីៗនៅភ្នំពេញ (Famous Boreys in PP)
export const PP_BOREYS = [
  // ពិភពថ្មី
  'បុរីពិភពថ្មី', 'ពិភពថ្មី', 'piphop thmey',
  'ពិភពថ្មីចំការដូង', 'ពិភពថ្មីកំបូល', 'ពិភពថ្មីកួរស្រូវ', 'ពិភពថ្មីគួរស្រូវ', 'ពិភពថ្មីឈូកវ៉ា', 'ពិភពថ្មីតាខ្មៅ',
  'ពិភពថ្មី១', 'ពិភពថ្មី1', 'ពិភពថ្មី២', 'ពិភពថ្មី2',

  // ប៉េងហួត
  'បុរីប៉េងហួត', 'ប៉េងហួត', 'peng huoth', 'penghuoth',
  'ប៉េងហួតបឹងស្នោ', 'ប៉េងហួត60m', 'ប៉េងហួត 60m', 'ប៉េងហួត50m', 'ប៉េងហួត 50m', 'ប៉េងហួត2004', 'polaris',

  // ជីបម៉ុង
  'បុរីជីបម៉ុង', 'ជីបម៉ុង', 'chip mong', 'chipmong',

  // អ័រគីដេ
  'បុរីអ័រគីដេ', 'អ័រគីដេ', 'orkide', 'orchid', 'អ័រគីដេ2004', 'អ័រគីដេពោធិ៍ចិនតុង',

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
  'សំណង់១២', 'សំណង់ 12', 'សំណង១២'
];

// ៤. ផ្សារទំនើប មន្ទីរពេទ្យ សាកលវិទ្យាល័យ និងផ្លូវធំៗនៅភ្នំពេញ
export const PP_LANDMARKS_AND_ROADS = [
  // ផ្សារទំនើប
  'aeon1', 'aeon2', 'aeon3', 'aeon', 'អ៊ីអន១', 'អ៊ីអន1', 'អ៊ីអន២', 'អ៊ីអន2', 'អ៊ីអន៣', 'អ៊ីអន3', 'អ៊ីអន',
  'makro', 'ម៉ាក្រូ', 'tk avenue', 'eden garden', 'midtown', 'sorya', 'ratana plaza', 'k mall',
  // មន្ទីរពេទ្យ
  'ពេទ្យតេជោ', 'កាល់ម៉ែត', 'calmette', 'ពេទ្យរុស្ស៊ី', 'ពេទ្យលោកសង្ឃ', 'ពេទ្យគន្ធបុប្ផា', 'ពេទ្យកុមារជាតិ',
  'ពេទ្យជប៉ុន', 'ពេទ្យព្រះកេតុមាលា', 'ពេទ្យជោរៃ',
  // សាលា
  'តិចណូ', 'itc', 'rupp', 'ifl',
  // ផ្លូវធំៗ
  'ផ្លូវ 2004', 'ផ្លូវ2004', 'ផ្លូវ 271', 'ផ្លូវ271', 'ផ្លូវ 371', 'ផ្លូវ371',
  'ផ្លូវ 598', 'ផ្លូវ598', 'ផ្លូវ 1986', 'ផ្លូវ1986', 'ផ្លូវ 1003', 'ផ្លូវ1003', 'ផ្លូវ 1928', 'ផ្លូវ1928',
  'ផ្លូវ 60ម៉ែត្រ', 'ផ្លូវ60ម៉ែត្រ', 'ផ្លូវ 60m', 'ផ្លូវ60m', '60ម៉ែត្រ',
  'ផ្លូវ 50ម៉ែត្រ', 'ផ្លូវ50ម៉ែត្រ', 'ផ្លូវ 50m', 'ផ្លូវ50m', '50ម៉ែត្រ',
  'ផ្លូវ 30ម៉ែត្រ', 'ផ្លូវ30ម៉ែត្រ', 'ផ្លូវ 30m', 'ផ្លូវ30m', '30ម៉ែត្រ',
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

// ៦. បញ្ជីឈ្មោះខេត្តទាំង ២៤ និងក្រុង/ស្រុកធំៗតាមខេត្ត (Provinces outside Phnom Penh)
export const PROVINCES_MAP: Array<{
  name: string;
  aliases: string[];
  districts: string[];
}> = [
  {
    name: 'សៀមរាប',
    aliases: ['siem reap', 'siemreap', 'sr'],
    districts: ['ក្រុងសៀមរាប', 'បន្ទាយស្រី', 'ពួក', 'ស្រុកពួក', 'ប្រាសាទបាគង', 'អង្គរធំ', 'ស្វាយលើ', 'ជីក្រែង', 'សូទ្រនិគម', 'ក្រឡាញ់', 'រុនតាឯក', 'ផ្សារលើ']
  },
  {
    name: 'បាត់ដំបង',
    aliases: ['battambang', 'btb'],
    districts: ['ក្រុងបាត់ដំបង', 'ថ្មគោល', 'ស្រុកថ្មគោល', 'បាណន់', 'បវេល', 'ស្រុកបវេល', 'ឯកភ្នំ', 'មោងឫស្សី', 'មោងឬស្សី', 'ស្រុកមោង', 'រតនមណ្ឌល', 'សង្កែ', 'សំឡូត', 'សំពៅលូន', 'ភ្នំព្រឹក', 'កំរៀង', 'កោះក្រឡ', 'រុក្ខគិរី']
  },
  {
    name: 'កំពង់ចាម',
    aliases: ['kampong cham', 'kompong cham', 'kpc'],
    districts: ['ក្រុងកំពង់ចាម', 'ព្រៃឈរ', 'ស្រុកព្រៃឈរ', 'ចំការលើ', 'ស្រុកចំការលើ', 'កោះសូទិន', 'ស្ទឹងត្រង់', 'ស្រីសន្ធរ', 'បាធាយ', 'ស្រុកបាធាយ']
  },
  {
    name: 'កំពង់ស្ពឺ',
    aliases: ['kampong speu', 'kompong speu', 'kps'],
    districts: ['ក្រុងច្បារមន', 'ច្បារមន', 'ឧដុង្គ', 'ឧត្តុង្គ', 'សំរោងទង', 'ស្រុកសំរោងទង', 'គងពិសី', 'ស្រុកគងពិសី', 'បសេដ្ឋ', 'បរសេដ្ឋ', 'ស្រុកបសេដ្ឋ', 'ស្រុកបរសេដ្ឋ', 'ភ្នំស្រួច', 'ថ្ពង', 'ឱរ៉ាល់']
  },
  {
    name: 'ព្រះសីហនុ',
    aliases: ['កំពង់សោម', 'កំបង់សោម', 'sihanoukville', 'kampong som', 'shv'],
    districts: ['ក្រុងព្រះសីហនុ', 'ក្រុងកោះរ៉ុង', 'កោះរ៉ុង', 'ព្រៃនប់', 'ស្រុកព្រៃនប់', 'ស្ទឹងហាវ', 'កំពង់សិលា', 'ស្រុកកំពង់សិលា']
  },
  {
    name: 'បន្ទាយមានជ័យ',
    aliases: ['banteay meanchey', 'bmc'],
    districts: ['ក្រុងសិរីសោភ័ណ', 'សិរីសោភ័ណ', 'ក្រុងប៉ោយប៉ែត', 'ប៉ោយប៉ែត', 'poipet', 'មង្គលបូរី', 'ភ្នំស្រុក', 'ព្រះនេត្រព្រះ', 'ថ្មពួក', 'ស្វាយចេក', 'ម៉ាឡៃ']
  },
  {
    name: 'តាកែវ',
    aliases: ['takeo'],
    districts: ['ក្រុងដូនកែវ', 'ដូនកែវ', 'អង្គរបុរី', 'បាទី', 'ស្រុកបាទី', 'គិរីវង់', 'កោះអណ្តែត', 'ព្រៃកប្បាស', 'ត្រាំកក់', 'ស្រុកត្រាំកក់', 'ទ្រាំង', 'ស្រុកទ្រាំង', 'ផ្សារទន្លាប់', 'ទន្លាប់', 'ផ្សារក្តីទន្ទឹម', 'ក្តីទន្ទឹម']
  },
  {
    name: 'កំពត',
    aliases: ['kampot'],
    districts: ['ក្រុងកំពត', 'ទឹកឈូ', 'ឈូក', 'ស្រុកឈូក', 'អង្គរជ័យ', 'បន្ទាយមាស', 'កំពង់ត្រាច', 'ដងទង់']
  },
  {
    name: 'ស្វាយរៀង',
    aliases: ['svay rieng', 'svayrieng'],
    districts: ['ក្រុងស្វាយរៀង', 'ក្រុងបាវិត', 'បាវិត', 'bavet', 'រមាសហែក', 'រំដួល', 'ស្រុករំដួល', 'ស្វាយជ្រំ', 'ស្វាយទាប', 'ចន្ទ្រា']
  },
  {
    name: 'ព្រៃវែង',
    aliases: ['prey veng', 'preyveng'],
    districts: ['ក្រុងព្រៃវែង', 'បាភ្នំ', 'ស្រុកបាភ្នំ', 'ពាមជរ', 'ពាមរក៍', 'ពោធិ៍រៀង', 'ព្រះស្តេច', 'កំចាយមារ', 'ស្រុកកំចាយមារ', 'មេសាង', 'ស្រុកមេសាង', 'ស៊ីធរកណ្តាល', 'ស្វាយអន្ធរ']
  },
  {
    name: 'កំពង់ធំ',
    aliases: ['kampong thom', 'kompong thom'],
    districts: ['ក្រុងស្ទឹងសែន', 'ស្ទឹងសែន', 'បារាយណ៍', 'សន្ទុក', 'ស្រុកសន្ទុក', 'ប្រាសាទបល្ល័ង្ក', 'ប្រាសាទសំបូរ', 'កំពង់ស្វាយ', 'តាំងគោក']
  },
  {
    name: 'កំពង់ឆ្នាំង',
    aliases: ['kampong chhnang', 'kompong chhnang'],
    districts: ['ក្រុងកំពង់ឆ្នាំង', 'រលាប្អៀរ', 'បរិបូណ៌', 'កំពង់ត្រឡាច', 'សាមគ្គីមានជ័យ', 'ទឹកផុស']
  },
  {
    name: 'ពោធិ៍សាត់',
    aliases: ['pursat'],
    districts: ['ក្រុងពោធិ៍សាត់', 'បាកាន', 'ស្រុកបាកាន', 'ក្រគរ', 'ស្រុកក្រគរ', 'ភ្នំក្រវាញ', 'វាលវែង', 'កណ្តៀង']
  },
  {
    name: 'ក្រចេះ',
    aliases: ['kratie'],
    districts: ['ក្រុងក្រចេះ', 'សំបូរ', 'ព្រែកប្រសព្វ', 'ឆ្លូង', 'ស្រុកឆ្លូង', 'ស្នួល', 'ស្រុកស្នួល', 'ចិត្របុរី']
  },
  {
    name: 'កោះកុង',
    aliases: ['koh kong', 'kohkong'],
    districts: ['ក្រុងខេមរភូមិន្ទ', 'ខេមរភូមិន្ទ', 'ស្រែអំបិល', 'ស្រុកស្រែអំបិល', 'បូទុមសាគរ', 'គិរីសាគរ', 'ថ្មបាំង']
  },
  {
    name: 'ត្បូងឃ្មុំ',
    aliases: ['tboung khmum'],
    districts: ['ក្រុងសួង', 'សួង', 'មេមត់', 'ស្រុកមេមត់', 'ពញាក្រែក', 'អូររាំងឪ', 'ក្រូចឆ្មារ', 'ដំបែ']
  },
  {
    name: 'មណ្ឌលគិរី',
    aliases: ['mondulkiri'],
    districts: ['ក្រុងសែនមនោរម្យ', 'សែនមនោរម្យ', 'អូររាំង', 'កែវសីមា', 'ពេជ្រាដា', 'កោះញែក']
  },
  {
    name: 'រតនគិរី',
    aliases: ['ratanakiri'],
    districts: ['ក្រុងបានលុង', 'បានលុង', 'បរកែវ', 'កូនមុំ', 'លំផាត់', 'អណ្តូងមាស', 'អូរជុំ', 'អូរយ៉ាដាវ', 'តាវែង', 'វើនសៃ']
  },
  {
    name: 'ព្រះវិហារ',
    aliases: ['preah vihear'],
    districts: ['ក្រុងត្បែងមានជ័យ', 'ត្បែងមានជ័យ', 'គូលែន', 'ស្រុកគូលែន', 'ជាំក្សាន្ត', 'រវៀង', 'ឆែប', 'ជ័យសែន', 'សង្គមថ្មី']
  },
  {
    name: 'ស្ទឹងត្រែង',
    aliases: ['stung treng'],
    districts: ['ក្រុងស្ទឹងត្រែង', 'សេសាន', 'សៀមបូក', 'សៀមប៉ាង', 'ថាឡាបរិវ៉ាត់']
  },
  {
    name: 'ឧត្តរមានជ័យ',
    aliases: ['oddar meanchey'],
    districts: ['ក្រុងសំរោង', 'អន្លង់វែង', 'ស្រុកអន្លង់វែង', 'ចុងកាល់', 'បន្ទាយអំពិល', 'ត្រពាំងប្រាសាទ']
  },
  {
    name: 'ប៉ៃលិន',
    aliases: ['pailin'],
    districts: ['ក្រុងប៉ៃលិន', 'សាលាក្រៅ']
  },
  {
    name: 'កែប',
    aliases: ['kep'],
    districts: ['ក្រុងកែប', 'ដំណាក់ចង្អើរ']
  },
  {
    name: 'កណ្តាល',
    aliases: ['kandal', 'កណ្ដាល'],
    districts: ['ស្រុកស្អាង', 'ស្អាង', 'ស្រុកកោះធំ', 'កោះធំ', 'ស្រុកលើកដែក', 'លើកដែក', 'ស្រុកកណ្តាលស្ទឹង', 'កណ្តាលស្ទឹង', 'ស្រុកខ្សាច់កណ្តាល', 'ខ្សាច់កណ្តាល', 'ស្រុកមុខកំពូល', 'មុខកំពូល', 'ស្រុកពញាឮ', 'ពញាឮ']
  }
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

// Combine all Phnom Penh keywords into a sorted list (longest first to match specific before generic)
const ALL_PP_KEYWORDS = Array.from(new Set([
  ...PP_KHANS,
  ...PP_SANGKATS_AND_AREAS,
  ...PP_BOREYS,
  ...PP_LANDMARKS_AND_ROADS,
  ...GREATER_PP_AREAS
])).sort((a, b) => b.length - a.length);

// Canonical name normalization
const canonicalNameMap: Record<string, string> = {
  'ពោចិនតុង': 'ពោធិ៍សែនជ័យ / ពោធិ៍ចិនតុង',
  'ពោធិចិនតុង': 'ពោធិ៍សែនជ័យ / ពោធិ៍ចិនតុង',
  'ជេីងឯក': 'ជើងឯក',
  'ព្រែកលាប': 'ព្រែកលៀប',
  'ព្រែបលាប': 'ព្រែកលៀប',
  'សំណង១២': 'សំណង់១២',
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
 * Clean and normalize text: removes invisible zero-width chars and converts Khmer digits to Arabic
 */
function cleanText(text: string): string {
  if (!text) return '';
  return text
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, ' ')
    .replace(/[០-៩]/g, ch => ({ '០': '0', '១': '1', '២': '2', '៣': '3', '៤': '4', '៥': '5', '៦': '6', '៧': '7', '៨': '8', '៩': '9' }[ch] || ch))
    .trim();
}

/**
 * Deep sanitization for address extraction:
 * Strips phone numbers, product codes with quantities and sizes (e.g. 24=1L, 15=1, 8M, 24=3 SML),
 * clothing types, color notes, measurements (160m, 50kg), and customer questions.
 */
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
  s = s.replace(/(?:កូដ|កូត|code|ម៉ូត)\s*\[?\s*[A-Za-z0-9]+\s*\]?(?:\s*[:=/\-_*xX»]\s*\d+)?/gi, ' ');
  s = s.replace(/\b(?:កូដ|កូត|code|ម៉ូត)\b/gi, ' ');

  // 3. Sizes & measurements (e.g. XXS..6XL, S, M, L, FS, 75kg, 160m)
  s = s.replace(/\b(?:XXS|XXL|6XL|5XL|4XL|3XL|2XL|XL|XS|[SML]|FS|FREESIZE)\b/gi, ' ');
  s = s.replace(/\b\d{1,3}\s*(?:kg|kilo|គីឡូ|គឺឡូ|កីឡូ|cm|m|ម៉ែត្រ)\b/gi, ' ');

  // 4. Action phrases with codes (e.g. យក 22=3, ថែម 33=1, បងយកកូដ 22, ថែមកូដ 21, យក=kg50)
  s = s.replace(/(?:យក|កាត់|ថែម|ដាក់|កក់|បូក|សុំ)\s*(?:កូដ|កូត|code|លេខ|ម៉ូត)?\s*[=:\-_*xX»]?\s*[A-Za-z0-9]*/gi, ' ');

  // 5. Khmer quantity phrases
  s = s.replace(/(?:មួយ|ពី|ពីរ|បី|បួន|ប្រាំ|1|2|3|4|5)\s*(?:អាវ|ខោ|ឈុត|ឆុត|រ៉ូប|សំពត់|កំប៉ុង|កញ្ចប់|គូ)/gi, ' ');
  s = s.replace(/\b(?:មួយ|ពីរ|បី|បួន|ប្រាំ)\s*(?:មុខ|កំរង|ឈុត|អាវ|ខោ)\b/gi, ' ');

  // 6. Colors
  s = s.replace(/(?:ពណ៍|ពណ៌|ពណ៏|ពណ)\s*[\u1780-\u17D2a-zA-Z0-9]+/gi, ' ');
  s = s.replace(/\b(?:ពណ៌|ពណ៍|ពណ៏|ពណ)?\s*(?:សរ?|ខ្មៅ|ក្រហម|ខៀវ|លឿង|ផ្កាឈូក|ស្វាយ|បៃតង|ត្នោត|ប្រផេះ|ទឹកដោះគោ|សូកូឡា|កាហ្វេ|ឈាមជ្រូក|ផ្ទៃមេឃ|ត្រួយចេក|បែកផ្សែង|ការ៉ុត|ទឹកក្រូច|កាពិ)\b/gi, ' ');

  // 7. Clothing types
  s = s.replace(/\b(?:ខោជើងប៉ាត|ខោជើងវែង|ខោជើងខ្លី|ខោ|អាវ|សំពត់|ឈុត|ឆុត|រ៉ូប|កាបូប|ស្បែកជើង)\b/gi, ' ');

  // 8. Questions & chat phrases
  s = s.replace(/(?:ពាក់បានអត់|ពាក់បានទេ|ពាក់បាន|ស្លៀកបាន|មានអត់|អស់នៅ|អស់ហើយ|លក់ម៉េច|ប៉ុន្មាន|ប៉ុន្មានបង|ប៉ុន្មានចែ|សុំមើល|លើកអាវ|លើកខោ|សាច់ស្អាត|សួស្តី|ជម្រាបសួរ|អរគុណ|បង|ចែ|admin|ok|yes|no)/gi, ' ');

  // 9. Stray numbers (e.g. "23 ផ្សារ..." or "...តាកែវ16")
  s = s.replace(/(?:^|(?<=\s))\d{1,4}(?=\s|$)/g, ' ');
  s = s.replace(/(?<=[\u1780-\u17D2])\d{1,4}(?=\s|$)/g, ' ');

  // 10. Clean symbols, asterisks, brackets
  s = s.replace(/[\*#@!~^%_+=:;\\/|()\[\]]+/g, ' ')
       .replace(/^[,\s.:;=()\-]+|[,\s.:;=()\-]+$/g, '')
       .replace(/\s{2,}/g, ' ')
       .trim();

  return s;
}

/**
 * Strips any leftover stray product code traces or numbers from a candidate location
 */
function postCleanLocation(loc: string): string {
  if (!loc) return '';
  let s = loc
    .replace(/(?:(?<=[^\w\u1780-\u17D2]|^)[A-Za-z0-9]{1,5}\s*[:=/\-_*xX»]+\s*[\*\-_=A-Za-z0-9]*)/gi, ' ')
    .replace(/(?:^|(?<=\s))\d{1,4}(?=\s|$)/g, ' ')
    .replace(/(?<=[\u1780-\u17D2])\d{1,4}(?=\s|$)/g, ' ')
    .replace(/\b(?:XXS|XXL|6XL|5XL|4XL|3XL|2XL|XL|XS|[SML]|FS|FREESIZE)\b/gi, ' ')
    .replace(/[\*#@!~^%_+=:;\\/|\[\]]+/g, ' ')
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

  // If text after cleaning is already concise and contains matchedKeyword, check if it's a clean address phrase
  if (sanitized.includes(matchedKeyword)) {
    // Check if there are valid address prefix markers before the keyword
    const addressBlockPattern = new RegExp(
      '(?:(?:ផ្ទះ|ផ្លូវ|បុរី|សង្កាត់|ខណ្ឌ|ក្រុង|ស្រុក|ភូមិ|ឃុំ|ផ្សារ|ម្តុំ|ជិត|ក្បែរ|ទល់មុខ|ក្រោយ|ខាង|បន្ទប់|អគារ|ជាន់ទី)\\s*[^|,\n\r=]*?\\s*)?' +
      matchedKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
      '(?:\\s*[^|,\n\r=]*?(?:ភ្នំពេញ|ខេត្ត|ក្រុង|ស្រុក|ខណ្ឌ|សង្កាត់|ផ្លូវ|ផ្ទះ|[0-9]{1,4}))?',
      'i'
    );
    const m = sanitized.match(addressBlockPattern);
    if (m && m[0] && m[0].trim().length >= matchedKeyword.length) {
      let candidate = postCleanLocation(m[0].trim());
      // Ensure candidate doesn't end with random stray letters or numbers
      candidate = candidate.replace(/\b(?:0\d{8,9}|A\d+|B\d+|K\d+)\b.*$/i, '').trim();
      if (candidate.length >= matchedKeyword.length && !/(?:=|\bkilo\b|\bkg\b)/i.test(candidate)) {
        return candidate;
      }
    }

    // If sanitized phrase only contains clean location words
    const words = sanitized.split(/\s+/).filter(Boolean);
    if (words.length <= 4 && !/(?:=|\bkilo\b|\bkg\b|\bcode\b|កូដ|កូត)/i.test(sanitized)) {
      const cleaned = postCleanLocation(sanitized);
      if (cleaned.includes(matchedKeyword) && cleaned.length >= matchedKeyword.length) {
        return cleaned;
      }
    }
  }

  return canonical;
}

/**
 * ⚡ HIGH-PRECISION LOCATION & DELIVERY ZONE DETECTOR
 *
 * App Focus:
 * 1. Accurately detect Phnom Penh (PP) locations (14 Khans, 105 Sangkats, Boreys, Roads, Landmarks).
 * 2. Everything else is cleanly categorized into PROVINCE ('🏞️ តាមខេត្ត')!
 *    (e.g., out of 200 baskets, 50 PP are accurately detected, the other 150 go to Province).
 * 3. Strictly guarantees ZERO product codes, phone numbers, or quantities leak into the address.
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
  // STEP 2: CHECK FOR EXPLICIT PHNOM PENH GEOGRAPHY (HIGH PRECISION)
  // -------------------------------------------------------------------------
  // Scan ALL Phnom Penh specific locations, Sangkats, Khans, Boreys, and Roads
  for (const loc of ALL_PP_KEYWORDS) {
    if (lower.includes(loc.toLowerCase())) {
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

  // Generic Phnom Penh regex & keywords
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
  // STEP 3: ALL OTHER CASES ARE AUTOMATICALLY PROVINCE (ក្រៅពីភ្នំពេញដាក់ខេត្តទៅ)!
  // -------------------------------------------------------------------------

  // A. Check for Provincial Couriers / Express
  for (const courier of PROVINCIAL_COURIERS) {
    if (courier === 'vet' || courier === 'ce') {
      const re = new RegExp(`(?:^|\\s|ផ្ញើ|ក្រុមហ៊ុន)${courier}(?:\\s|$|express)`, 'i');
      if (re.test(lower)) {
        return {
          zone: 'PROVINCE',
          label: '🏞️ តាមខេត្ត',
          detectedLocation: postCleanLocation(courier),
          matchedKeyword: courier,
          hasExplicitLocation: true
        };
      }
      continue;
    }

    if (lower.includes(courier.toLowerCase())) {
      const cleanLoc = postCleanLocation(extractFullAddressSentence(normalized, courier) || courier);
      return {
        zone: 'PROVINCE',
        label: '🏞️ តាមខេត្ត',
        detectedLocation: cleanLoc || courier,
        matchedKeyword: courier,
        hasExplicitLocation: true
      };
    }
  }

  // B. Check 24 Provinces and their districts
  for (const prov of PROVINCES_MAP) {
    // Check main province name
    if (lower.includes(prov.name.toLowerCase())) {
      const cleanLoc = postCleanLocation(extractFullAddressSentence(normalized, prov.name) || prov.name);
      return {
        zone: 'PROVINCE',
        label: '🏞️ តាមខេត្ត',
        detectedLocation: cleanLoc || prov.name,
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

    // Check districts (e.g. 'បសេដ្ឋ', 'បរសេដ្ឋ', 'ផ្សារទន្លាប់', 'ថ្មគោល', 'ក្រុងសៀមរាប')
    for (const dist of prov.districts) {
      if (lower.includes(dist.toLowerCase())) {
        const cleanLoc = postCleanLocation(extractFullAddressSentence(normalized, dist) || dist);
        const finalLoc = cleanLoc && cleanLoc.includes(prov.name) ? cleanLoc : `${cleanLoc || dist} (${prov.name})`;
        return {
          zone: 'PROVINCE',
          label: '🏞️ តាមខេត្ត',
          detectedLocation: finalLoc,
          matchedKeyword: dist,
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
      const fullAddr = postCleanLocation(extractFullAddressSentence(normalized, m[0].trim()));
      return {
        zone: 'PROVINCE',
        label: '🏞️ តាមខេត្ត',
        detectedLocation: fullAddr || m[0].trim(),
        matchedKeyword: m[0].trim(),
        hasExplicitLocation: true
      };
    }
  }

  // -------------------------------------------------------------------------
  // STEP 4: DEFAULT FALLBACK (No explicit location found -> ALWAYS PROVINCE)
  // "ក្រៅពីភ្នំពេញដាក់ខេតទៅ, ex 200 កន្រ្តក់ ប្រពន្ធ័ ចាប់ភ្នំពេញបាន 50 ក្រៅពីនឹងដាក់ចូលខេត្ត 150"
  // -------------------------------------------------------------------------
  return {
    zone: 'PROVINCE',
    label: '🏞️ តាមខេត្ត',
    detectedLocation: '🏞️ តាមខេត្ត',
    hasExplicitLocation: false
  };
}

/**
 * Extracts clean address text from comment by removing product codes, phone numbers, and action words
 */
export function extractCleanAddressFromComment(rawComment: string): string | null {
  if (!rawComment || !rawComment.trim()) return null;

  // Guard against questions or chatter
  if (/(?:ពាក់បានអត់|ពាក់បានទេ|ពាក់បាន|ស្លៀកបាន|មានអត់|អស់នៅ|អស់ហើយ|លក់ម៉េច|ប៉ុន្មាន|សុំមើល|លើកអាវ|លើកខោ|សាច់ស្អាត)/i.test(rawComment)) {
    return null;
  }

  const s = cleanAddressInput(rawComment);

  // If remaining text has at least 2 characters and has an explicit location
  if (s && s.length >= 2) {
    const res = detectDeliveryZone(s);
    if (res.hasExplicitLocation && res.detectedLocation) {
      const cleanLoc = postCleanLocation(res.detectedLocation);
      if (cleanLoc.length >= 2 && !/(?:=|\bkilo\b|\bkg\b)/i.test(cleanLoc)) {
        return canonicalNameMap[cleanLoc] || cleanLoc;
      }
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

  // 2. Chat inquiries & questions (e.g. "ខោជើងប៉ាតនិង160mពាក់បានអត់បង", "សួស្តី", "សុំមើល", "លក់ម៉េច", "ប៉ុន្មាន")
  if (/(?:ពាក់បានអត់|ពាក់បានទេ|ពាក់បាន|ស្លៀកបាន|មានអត់|អស់នៅ|អស់ហើយ|លក់ម៉េច|ប៉ុន្មាន|ប៉ុន្មានបង|ប៉ុន្មានចែ|សុំមើល|លើកអាវ|លើកខោ|សាច់ស្អាត|សួស្តី|ជម្រាបសួរ|អរគុណ|បងលើក)/i.test(s)) {
    return true;
  }

  // 3. Pure location comments without order intent (e.g. "ផ្សារព្រែកឯង", "ចោមចៅ", "បែកចាន", "ទួលគោក", "សៀមរាប", "តាកែវ")
  const hasOrderPattern = /(?:(?<=[^\w\u1780-\u17D2]|^)[A-Za-z0-9]{1,5}\s*[:=/\-_*xX»]+\s*[\*\-_=A-Za-z0-9]*)|(?:(?:យក|កាត់|ថែម|ដាក់|កក់)\s*(?:កូដ|code)?[A-Za-z0-9]{1,5})/i.test(s);
  if (!hasOrderPattern) {
    if (/(?:ផ្សារ|បុរី|សង្កាត់|ខណ្ឌ|ក្រុង|ស្រុក|ភូមិ|ភ្នំពេញ|ចោមចៅ|ទឹកថ្លា|បែកចាន|ទួលគោក|ដង្កោ|សៀមរាប|បាត់ដំបង|កំពង់ចាម|កំពង់ស្ពឺ|តាកែវ|កំពត|ព្រៃវែង|ស្វាយរៀង|វីរៈប៊ុនថាំ|j&t|flash|បសេដ្ឋ|បរសេដ្ឋ|ទន្លាប់)/i.test(s)) {
      return true;
    }
  }

  return false;
}


