import React from 'react';
import { 
  Phone, 
  BookOpen, 
  BarChart3, 
  Target, 
  Activity, 
  Wrench, 
  Wallet, 
  Settings, 
  Mail, 
  Globe, 
  Info, 
  Shield, 
  Cpu, 
  ExternalLink, 
  Award,
  ArrowRight,
  Heart,
  HelpCircle
} from 'lucide-react';

interface AboutSystemTabProps {
  currentVersion?: string;
  onNavigate?: (view: 'calls' | 'directory' | 'reports' | 'marketing' | 'monitoring' | 'management' | 'balance' | 'settings' | 'about') => void;
}

export const AboutSystemTab: React.FC<AboutSystemTabProps> = ({ 
  currentVersion = '5.5.3',
  onNavigate 
}) => {
  const sectionsInfo = [
    {
      id: 'calls',
      title: 'Реестр звонков',
      icon: Phone,
      color: 'from-blue-500 to-sky-600',
      bgLight: 'bg-blue-50/50 dark:bg-blue-950/20',
      textColor: 'text-blue-600 dark:text-blue-400',
      desc: 'Полный архив телефонных разговоров АТС с гибкой системой фильтрации, поиском и плеером записей разговоров.',
      features: [
        'Интегрированный аудиоплеер с таймлайном и регулировкой скорости',
        'Быстрый экспорт записей звонков и детализации в формат XLSX',
        'Автоопределение направлений (входящие, исходящие, внутренние)',
        'Отображение статуса звонка (Отвечен, Занят, Нет ответа, Ошибка)'
      ]
    },
    {
      id: 'directory',
      title: 'Телефонный справочник',
      icon: BookOpen,
      color: 'from-emerald-500 to-teal-600',
      bgLight: 'bg-emerald-50/50 dark:bg-emerald-950/20',
      textColor: 'text-emerald-600 dark:text-emerald-400',
      desc: 'Единая база контактов компании с поддержкой импорта, разделения на личные и общие контакты и умным поиском.',
      features: [
        'Админский CSV-импорт клиентов с автоматическим маппингом полей',
        'Индивидуальный импорт контактов для каждого оператора',
        'Автоматический поиск по совпадению номера при входящем звонке',
        'Удобная форма ручного добавления и быстрого редактирования'
      ]
    },
    {
      id: 'reports',
      title: 'Отчеты и Аналитика',
      icon: BarChart3,
      color: 'from-purple-500 to-indigo-600',
      bgLight: 'bg-purple-50/50 dark:bg-purple-950/20',
      textColor: 'text-purple-600 dark:text-purple-400',
      desc: 'Интеллектуальные дашборды для оценки эффективности работы телефонии, активности операторов и качества сервиса.',
      features: [
        'Сводная воронка распределения вызовов по дням и часам',
        'Анализ потерянных клиентов с возможностью перезвона в клик',
        'Рейтинги операторов (количество принятых звонков, общая длительность)',
        'Визуальные графики и диаграммы на основе библиотеки Recharts'
      ]
    },
    {
      id: 'marketing',
      title: 'Маркетинг',
      icon: Target,
      color: 'from-pink-500 to-rose-600',
      bgLight: 'bg-pink-50/50 dark:bg-pink-950/20',
      textColor: 'text-pink-600 dark:text-pink-400',
      desc: 'Связь телефонных звонков с веб-активностью пользователей. Определение источников трафика и окупаемости рекламы.',
      features: [
        'Динамический и статический коллтрекинг (привязка номеров к сессиям)',
        'Интеграция с Яндекс Метрикой и Google Analytics на уровне API',
        'Отслеживание кликов по номерам на сайте (целевые действия)',
        'Карта сквозного маркетингового пути клиента от клика до звонка'
      ]
    },
    {
      id: 'monitoring',
      title: 'Мониторинг звонков',
      icon: Activity,
      color: 'from-rose-500 to-red-600',
      bgLight: 'bg-rose-50/50 dark:bg-rose-950/20',
      textColor: 'text-rose-600 dark:text-rose-400',
      desc: 'Интерфейс реального времени для контроля текущих разговоров на АТС через подключение к Asterisk Manager Interface (AMI).',
      features: [
        'Отображение активных каналов связи, участников разговора и длительности',
        'Встроенный симулятор живой активности для отладки АТС без звонков',
        'Возможность прослушивания, суфлирования или перехвата вызова онлайн',
        'Инструменты диагностики: sngrep, tcpdump и CLI-консоль Asterisk/FreePBX'
      ]
    },
    {
      id: 'management',
      title: 'Управление АТС',
      icon: Wrench,
      color: 'from-amber-500 to-orange-600',
      bgLight: 'bg-amber-50/50 dark:bg-amber-950/20',
      textColor: 'text-amber-600 dark:text-amber-400',
      desc: 'Централизованная консоль администрирования внутренних номеров, транков, маршрутов и правил распределения вызовов.',
      features: [
        'Создание и редактирование SIP-аккаунтов и добавочных (extensions)',
        'Управление входящей/исходящей маршрутизацией FreePBX',
        'Интеллектуальная лаборатория транков (TrunkLab) для тестирования связи',
        'Режим предварительного просмотра изменений (Preview) перед применением'
      ]
    },
    {
      id: 'balance',
      title: 'Баланс операторов',
      icon: Wallet,
      color: 'from-cyan-500 to-teal-600',
      bgLight: 'bg-cyan-50/50 dark:bg-cyan-950/20',
      textColor: 'text-cyan-600 dark:text-cyan-400',
      desc: 'Контроль расходов, лимитов разговоров и биллинга операторов корпоративной телефонной сети.',
      features: [
        'Гибкая настройка тарифов по направлениям (мобильные, городские)',
        'Автоматические алерты и уведомления при достижении лимитов',
        'Детальный финансовый аудит расходов на связь по каждому добавочному',
        'Интеграция с внешними платежными шлюзами и биллинговыми API'
      ]
    },
    {
      id: 'settings',
      title: 'Настройки системы',
      icon: Settings,
      color: 'from-slate-600 to-slate-800',
      bgLight: 'bg-slate-50/55 dark:bg-slate-950/20',
      textColor: 'text-slate-600 dark:text-slate-400',
      desc: 'Конфигурация параметров интеграции, прав пользователей, подключения к базам данных и параметров безопасности.',
      features: [
        'Настройка параметров AMI-подключения (хост, порт, логин, пароль)',
        'Управление пользователями системы и гибкая ролевая модель',
        'Тонкая конфигурация хранения аудиозаписей звонков',
        'Логирование системных событий и ошибок безопасности'
      ]
    }
  ];

  return (
    <section className="w-full space-y-6 max-w-[1800px] mx-auto p-1 font-sans" id="about-system-tab-container">
      {/* 1. Header Card */}
      <div className="rounded-2xl border border-slate-200/70 bg-gradient-to-r from-slate-900 via-slate-850 to-blue-950 p-6 md:p-8 text-white shadow-lg dark:border-slate-800/80">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-500/10 border border-blue-400/20 px-3.5 py-1 text-xs font-bold text-blue-300">
              <Cpu className="h-4 w-4 text-blue-400" />
              PBXPuls Suite • Версия {currentVersion}
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight bg-gradient-to-r from-white via-slate-100 to-blue-200 bg-clip-text text-transparent">
              PBXPuls Call-Center Suite
            </h1>
            <p className="max-w-2xl text-sm font-medium text-slate-300/90 leading-relaxed">
              Многофункциональная аналитическая и управляющая экосистема для телефонии Asterisk и FreePBX.
              Связь звонков, справочников, аналитики и сетевой диагностики в одном современном интерфейсе.
            </p>
          </div>
          <div className="flex flex-col items-center justify-center shrink-0 bg-white/5 border border-white/10 rounded-2xl p-5 backdrop-blur-md min-w-[160px] text-center self-start md:self-auto">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Лицензия</span>
            <span className="text-lg font-black text-emerald-400 mt-1 uppercase tracking-tight flex items-center gap-1.5">
              <Shield className="h-4 w-4" /> Active Enterprise
            </span>
            <span className="text-[10px] text-slate-500 mt-2 font-mono">ID: {currentVersion.replace(/\./g, 'X')}</span>
          </div>
        </div>
      </div>

      {/* 2. Grid of Sections (Left Menu Items Map) */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 px-1">
          <LayersIcon className="h-5 w-5 text-blue-600" />
          <h2 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">Разделы и возможности системы</h2>
        </div>
        
        <div className="p-4 bg-blue-50/50 dark:bg-blue-950/20 rounded-xl text-xs text-blue-700 dark:text-blue-300 font-semibold border border-blue-100/60 dark:border-blue-900/40">
          💡 Вы можете кликнуть на стрелку на любой карточке ниже, чтобы мгновенно перейти в соответствующий раздел системы в левом меню.
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {sectionsInfo.map((sect) => {
            const IconComponent = sect.icon;
            return (
              <div
                key={sect.id}
                className="group rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`p-2.5 rounded-xl bg-gradient-to-br ${sect.color} text-white shadow-sm`}>
                        <IconComponent className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                          {sect.title}
                        </h3>
                        <span className="inline-block text-[9px] uppercase font-bold text-slate-400">
                          Модуль системы
                        </span>
                      </div>
                    </div>

                    {onNavigate && (
                      <button
                        onClick={() => onNavigate(sect.id as any)}
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-blue-600 dark:bg-slate-800 text-slate-400 hover:text-white transition-all cursor-pointer shadow-xs"
                        title={`Открыть: ${sect.title}`}
                      >
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <p className="mt-3 text-xs font-medium leading-relaxed text-slate-500 dark:text-slate-400 min-h-[48px]">
                    {sect.desc}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <h4 className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-2">
                    Функционал
                  </h4>
                  <ul className="space-y-1">
                    {sect.features.slice(0, 3).map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-350">
                        <span className={`inline-block w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 bg-gradient-to-r ${sect.color}`} />
                        <span className="truncate" title={feature}>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. About System, Copyright & Contact block (as requested) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-4">
        {/* Copyrights block */}
        <div className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-600" />
            <h3 className="font-bold text-slate-900 dark:text-white text-base">О системе и копирайты</h3>
          </div>
          
          <div className="text-xs font-medium text-slate-600 dark:text-slate-300 space-y-3 leading-relaxed border-b border-slate-100 dark:border-slate-800 pb-4">
            <p>
              Программное обеспечение <strong>PBXPuls Call-Center Suite</strong> спроектировано как комплексная рабочая среда операторов и руководителей отделов продаж. Система обеспечивает бесшовную интеграцию между телефонными станциями на базе Asterisk/FreePBX и пользовательскими интерфейсами.
            </p>
            <p>
              Все права защищены действующим законодательством об авторских правах и международными соглашениями.
            </p>
          </div>

          {/* Copyrights matching Footer details exactly */}
          <div className="bg-slate-50 dark:bg-slate-950 rounded-xl p-4 border border-slate-250/30 dark:border-slate-800/60 space-y-2">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">Юридические реквизиты и правообладатели</span>
            <p className="text-xs font-bold text-slate-850 dark:text-slate-200 leading-normal">
              © 2026 PBXPULS. Все права защищены. <br />
              Индивидуальный предприниматель Грунин К.В. <br />
              ИНН 9102057404.
            </p>
          </div>
        </div>

        {/* Contacts block */}
        <div className="lg:col-span-5 rounded-2xl border border-blue-100 dark:border-blue-900/30 bg-blue-50/20 dark:bg-blue-950/5 p-6 shadow-sm flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
              <Award className="h-5 w-5" />
              <h3 className="font-bold text-slate-900 dark:text-white text-base">Разработчик и Поддержка</h3>
            </div>

            <p className="text-xs font-medium leading-relaxed text-slate-600 dark:text-slate-350">
              Внедрение, разработка и поддержка высокопроизводительных VOIP-проектов любого уровня сложности на базе Asterisk.
            </p>

            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-3 text-xs font-semibold text-slate-600 dark:text-slate-300">
                <Globe className="h-4 w-4 text-slate-400 shrink-0" />
                <span>Официальный сайт:</span>
                <a 
                  href="https://grunin.org" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="font-bold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                >
                  grunin.org <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              <div className="flex items-center gap-3 text-xs font-semibold text-slate-600 dark:text-slate-300">
                <Phone className="h-4 w-4 text-slate-400 shrink-0" />
                <span>Телефон поддержки:</span>
                <a 
                  href="tel:+79787437943" 
                  className="font-bold text-blue-600 dark:text-blue-400 hover:underline"
                >
                  +7 (978) 743-79-43
                </a>
              </div>

              <div className="flex items-center gap-3 text-xs font-semibold text-slate-600 dark:text-slate-300">
                <Mail className="h-4 w-4 text-slate-400 shrink-0" />
                <span>Email:</span>
                <a 
                  href="mailto:support@pbxpuls.ru" 
                  className="font-bold text-blue-600 dark:text-blue-400 hover:underline"
                >
                  support@pbxpuls.ru
                </a>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-200/40 dark:border-slate-800 flex items-center gap-2 text-[11px] font-semibold text-slate-400">
            <Heart className="h-3.5 w-3.5 text-rose-500 fill-rose-500 animate-pulse" />
            <span>Разработано для повышения эффективности вашего бизнеса.</span>
          </div>
        </div>
      </div>
    </section>
  );
};

// Helper simple icon for layers to prevent missing imports
function LayersIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="m12 3-10 5 10 5 10-5-10-5Z" />
      <path d="m2 17 10 5 10-5" />
      <path d="m2 12 10 5 10-5" />
    </svg>
  );
}
