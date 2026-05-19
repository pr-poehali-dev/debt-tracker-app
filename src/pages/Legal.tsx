import { useNavigate, useParams } from "react-router-dom";
import Icon from "@/components/ui/icon";

const MERCHANT = {
  name: "Еловых Иван Иванович",
  inn: "501602881175",
  email: "elovyh@list.ru",
  phone: "+7 968 006-66-66",
  address: "141282, Россия, Московская обл., г. Ивантеевка, г. Пушкино, ул. Новая Слобода, д. 3, кв. 50",
  site: "debt-debt.ru",
  status: "Самозанятый (плательщик НПД)",
  merchantId: "200000001749046",
  terminalId: "25890975",
};

const SECTIONS: Record<string, { title: string; body: JSX.Element }> = {
  contacts: {
    title: "Контакты",
    body: (
      <>
        <p>Если у вас есть вопросы по работе сервиса Debt-Debt, оплате подписки или возврату средств — свяжитесь с нами любым удобным способом:</p>
        <ul>
          <li><b>Email:</b> <a href={`mailto:${MERCHANT.email}`}>{MERCHANT.email}</a></li>
          <li><b>Телефон:</b> <a href={`tel:${MERCHANT.phone.replace(/\s|-/g, "")}`}>{MERCHANT.phone}</a></li>
          <li><b>Сайт:</b> {MERCHANT.site}</li>
          <li><b>Время ответа:</b> до 24 часов в рабочие дни</li>
        </ul>
        <p>По всем вопросам можно писать на email или звонить — мы стараемся отвечать максимально быстро.</p>
      </>
    ),
  },
  requisites: {
    title: "Реквизиты",
    body: (
      <>
        <p>Продавцом услуг сервиса Debt-Debt является:</p>
        <ul>
          <li><b>ФИО:</b> {MERCHANT.name}</li>
          <li><b>Статус:</b> {MERCHANT.status}</li>
          <li><b>ИНН:</b> {MERCHANT.inn}</li>
          <li><b>Email:</b> <a href={`mailto:${MERCHANT.email}`}>{MERCHANT.email}</a></li>
          <li><b>Телефон:</b> {MERCHANT.phone}</li>
          <li><b>Сайт:</b> {MERCHANT.site}</li>
          <li><b>Регион:</b> Россия</li>
        </ul>
        <h3>Платёжные реквизиты</h3>
        <ul>
          <li><b>Банк-эквайер:</b> АО «Т-Банк»</li>
          <li><b>Merchant ID:</b> {MERCHANT.merchantId}</li>
          <li><b>Terminal ID:</b> {MERCHANT.terminalId}</li>
          <li><b>Способы оплаты:</b> банковские карты VISA, MasterCard, МИР, СБП, T-Pay</li>
        </ul>
      </>
    ),
  },
  refund: {
    title: "Возврат средств",
    body: (
      <>
        <h3>Условия возврата</h3>
        <p>Сервис Debt-Debt предоставляет цифровую услугу — доступ к функциям приложения по подписке Pro и разовым покупкам (например, экспорт PDF).</p>
        <p><b>Вы можете запросить возврат в течение 14 дней</b> с момента оплаты подписки, если вы не использовали платные функции активно (не более 1 раза за период).</p>
        <h3>Как оформить возврат</h3>
        <ol>
          <li>Напишите на email <a href={`mailto:${MERCHANT.email}`}>{MERCHANT.email}</a> с темой «Возврат»</li>
          <li>Укажите номер платежа, email или телефон аккаунта, причину возврата</li>
          <li>Мы рассматриваем заявку в течение 3 рабочих дней</li>
          <li>При одобрении деньги возвращаются на ту же карту в течение 5–10 рабочих дней</li>
        </ol>
        <h3>В возврате может быть отказано</h3>
        <ul>
          <li>если прошло более 14 дней с момента оплаты</li>
          <li>если функции подписки использовались активно</li>
          <li>при оплате разовых услуг (PDF-экспорт), уже предоставленных</li>
        </ul>
      </>
    ),
  },
  privacy: {
    title: "Политика конфиденциальности",
    body: (
      <>
        <p>Настоящая Политика конфиденциальности описывает порядок обработки персональных данных пользователей сервиса Debt-Debt.</p>
        <h3>1. Какие данные мы собираем</h3>
        <ul>
          <li>ФИО, телефон, email — для регистрации и связи</li>
          <li>Данные о ваших долгах и контактах — для работы сервиса (хранятся только на вашем аккаунте)</li>
          <li>Данные платежей — обрабатываются платёжной системой Т-Банк, мы не храним номера карт</li>
        </ul>
        <h3>2. Цели обработки</h3>
        <ul>
          <li>предоставление функций сервиса</li>
          <li>связь с пользователем по вопросам оплаты, поддержки</li>
          <li>выполнение требований законодательства РФ</li>
        </ul>
        <h3>3. Безопасность</h3>
        <p>Передача данных идёт по защищённому соединению HTTPS. Данные хранятся на серверах с ограниченным доступом. Платёжные данные обрабатываются только сертифицированным платёжным провайдером Т-Банк по стандарту PCI DSS.</p>
        <h3>4. Передача третьим лицам</h3>
        <p>Мы не передаём ваши персональные данные третьим лицам, кроме случаев, предусмотренных законом, и кроме платёжного провайдера (Т-Банк) для проведения оплаты.</p>
        <h3>5. Ваши права</h3>
        <p>Вы можете запросить удаление своих данных, написав на <a href={`mailto:${MERCHANT.email}`}>{MERCHANT.email}</a>.</p>
        <h3>6. Контакты оператора</h3>
        <p>Оператор персональных данных: {MERCHANT.name}, ИНН {MERCHANT.inn}, {MERCHANT.email}.</p>
      </>
    ),
  },
  offer: {
    title: "Публичная оферта",
    body: (
      <>
        <p>Настоящий документ является публичной офертой {MERCHANT.name} (ИНН {MERCHANT.inn}), далее — «Исполнитель», и адресован любому физическому лицу, далее — «Пользователь».</p>
        <h3>1. Предмет договора</h3>
        <p>Исполнитель предоставляет Пользователю доступ к функциям сервиса Debt-Debt (учёт долгов, напоминания, отчёты, экспорт документов) на условиях подписки Pro либо разовых покупок.</p>
        <h3>2. Стоимость и оплата</h3>
        <ul>
          <li>Подписка Pro на 1 месяц — 199 ₽</li>
          <li>Подписка Pro на 1 год — 1 990 ₽</li>
          <li>Экспорт договора и истории в PDF — 99 ₽ (разовая покупка)</li>
        </ul>
        <p>Оплата производится банковской картой через платёжного провайдера Т-Банк (T-Pay). Услуга считается оказанной с момента активации подписки в личном кабинете.</p>
        <h3>3. Возврат средств</h3>
        <p>Возврат возможен в порядке, описанном в разделе «Возврат средств».</p>
        <h3>4. Ответственность</h3>
        <p>Исполнитель не несёт ответственности за корректность сведений, вносимых Пользователем, и за возможные финансовые потери Пользователя при использовании сервиса.</p>
        <h3>5. Принятие оферты</h3>
        <p>Оплата любой услуги означает полное и безоговорочное принятие настоящей оферты.</p>
        <h3>6. Реквизиты Исполнителя</h3>
        <p>{MERCHANT.name}, {MERCHANT.status}, ИНН {MERCHANT.inn}, email {MERCHANT.email}.</p>
      </>
    ),
  },
  delivery: {
    title: "Условия предоставления услуги",
    body: (
      <>
        <p>Debt-Debt — <b>цифровой сервис</b>. Услуга предоставляется онлайн, физическая доставка товаров не осуществляется.</p>
        <h3>Сроки активации</h3>
        <ul>
          <li>Подписка Pro активируется автоматически сразу после успешной оплаты — обычно в течение 1 минуты</li>
          <li>PDF-экспорт становится доступен в личном кабинете сразу после оплаты</li>
        </ul>
        <h3>Регион предоставления</h3>
        <p>Услуга доступна на территории Российской Федерации. Технически сервисом можно пользоваться из любой страны при наличии интернета.</p>
        <h3>Если подписка не активировалась</h3>
        <p>Если после оплаты Pro не появилась в течение 10 минут — напишите на <a href={`mailto:${MERCHANT.email}`}>{MERCHANT.email}</a>, мы активируем вручную.</p>
      </>
    ),
  },
  security: {
    title: "Информационная безопасность",
    body: (
      <>
        <h3>Защита данных</h3>
        <ul>
          <li>Весь трафик сайта передаётся по защищённому протоколу <b>HTTPS</b> с шифрованием TLS</li>
          <li>Пароли пользователей хранятся в виде криптографических хэшей, мы не можем их прочитать</li>
          <li>Доступ к серверам ограничен — только администраторы сервиса</li>
        </ul>
        <h3>Платежи</h3>
        <ul>
          <li>Оплата проводится через сертифицированного провайдера <b>Т-Банк (T-Pay)</b>, соответствующего стандарту <b>PCI DSS</b></li>
          <li>Номера карт никогда не попадают на наш сервер — они вводятся напрямую на защищённой странице банка</li>
          <li>Мы храним только идентификатор платежа для подтверждения оплаты</li>
        </ul>
        <h3>Передача конфиденциальной информации</h3>
        <p>Любая передача данных между вашим устройством и сервером шифруется. Cookies сессии защищены флагами HttpOnly и Secure. Сервис не использует сторонние рекламные трекеры.</p>
      </>
    ),
  },
};

export default function Legal() {
  const { page = "contacts" } = useParams();
  const navigate = useNavigate();
  const data = SECTIONS[page] ?? SECTIONS.contacts;

  return (
    <div style={{ minHeight: "100vh", background: "#0d0f1a", color: "#e8e6f0", fontFamily: "Golos Text, sans-serif" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px 20px 80px" }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "transparent", border: "none", color: "#a78bfa",
            fontSize: 14, cursor: "pointer", marginBottom: 24, padding: 0,
          }}
        >
          <Icon name="ArrowLeft" size={16} /> Назад
        </button>

        <h1 style={{
          fontSize: 32, fontWeight: 800, marginBottom: 24,
          background: "linear-gradient(135deg, #a855f7, #6366f1)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>
          {data.title}
        </h1>

        <div style={{
          fontSize: 15, lineHeight: 1.7,
          color: "rgba(232,230,240,0.85)",
        }} className="legal-body">
          {data.body}
        </div>

        <LegalFooter />
      </div>

      <style>{`
        .legal-body h3 { font-size: 18px; font-weight: 700; color: #fff; margin: 24px 0 10px; }
        .legal-body p { margin: 10px 0; }
        .legal-body ul, .legal-body ol { padding-left: 22px; margin: 10px 0; }
        .legal-body li { margin: 6px 0; }
        .legal-body a { color: #a78bfa; text-decoration: underline; }
        .legal-body b { color: #fff; }
      `}</style>
    </div>
  );
}

export function LegalFooter() {
  return (
    <footer style={{
      marginTop: 48, paddingTop: 24,
      borderTop: "1px solid rgba(255,255,255,0.08)",
      fontSize: 13, color: "rgba(180,170,210,0.7)",
    }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 18px", marginBottom: 18 }}>
        <a href="/legal/contacts" style={linkStyle}>Контакты</a>
        <a href="/legal/refund" style={linkStyle}>Возврат</a>
        <a href="/legal/delivery" style={linkStyle}>Условия услуги</a>
        <a href="/legal/offer" style={linkStyle}>Оферта</a>
        <a href="/legal/privacy" style={linkStyle}>Политика</a>
        <a href="/legal/security" style={linkStyle}>Безопасность</a>
        <a href="/legal/requisites" style={linkStyle}>Реквизиты</a>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
        <a href="https://www.tbank.ru" target="_blank" rel="noopener noreferrer"
           style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "#fff", textDecoration: "none",
                    background: "#ffdd2d", padding: "6px 12px", borderRadius: 8, fontWeight: 700, fontSize: 13 }}>
          <span style={{ color: "#000" }}>T-Pay</span>
        </a>
        <span style={{ fontSize: 12 }}>Приём платежей — Т-Банк, <a href="https://www.tbank.ru" target="_blank" rel="noopener noreferrer" style={{ color: "#a78bfa" }}>tbank.ru</a></span>
        <span style={{ display: "inline-flex", gap: 6 }}>
          <span style={chipStyle}>VISA</span>
          <span style={chipStyle}>MIR</span>
          <span style={chipStyle}>MC</span>
        </span>
      </div>

      <div style={{ fontSize: 12, color: "rgba(180,170,210,0.5)" }}>
        © {new Date().getFullYear()} Debt-Debt. {MERCHANT.name}, ИНН {MERCHANT.inn}. {MERCHANT.email}
      </div>
    </footer>
  );
}

const linkStyle: React.CSSProperties = {
  color: "#a78bfa", textDecoration: "none", fontSize: 13,
};

const chipStyle: React.CSSProperties = {
  display: "inline-block", padding: "2px 8px", border: "1px solid rgba(255,255,255,0.18)",
  borderRadius: 4, fontSize: 11, color: "rgba(232,230,240,0.8)", fontWeight: 600,
};