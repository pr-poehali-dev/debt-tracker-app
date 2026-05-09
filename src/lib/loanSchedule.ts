import type { PersonalLoan } from "@/components/PersonalLoanModal";

export interface ScheduleRow {
  month: string;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
  extra: number;
}

export interface ScheduleResult {
  rows: ScheduleRow[];
  currentMonthly: number;
  totalToPay: number;
  totalInterest: number;
  remaining: number;
  monthCount: number;
}

function annuityPayment(principal: number, monthlyRate: number, months: number): number {
  if (principal <= 0 || months <= 0) return 0;
  if (monthlyRate <= 0) return Math.ceil(principal / months);
  return (principal * monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
}

function addMonths(ym: string, n: number): string {
  const d = new Date(ym + "-01");
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 7);
}

export function computeSchedule(loan: PersonalLoan): ScheduleResult {
  const rate = (loan.interestRate || 0) / 100 / 12;
  const initialMonths = loan.termMonths || Math.max(1, Math.round((new Date(loan.dueDate + "-01").getTime() - new Date(loan.startDate + "-01").getTime()) / (30 * 86400000)) + 1);
  const extras = (loan.extraPayments || []).slice().sort((a, b) => a.date.localeCompare(b.date));

  let balance = loan.totalAmount;
  let monthly = annuityPayment(balance, rate, initialMonths);
  let remainingMonths = initialMonths;

  const rows: ScheduleRow[] = [];
  let month = loan.startDate;
  let totalPaid = 0;
  let totalInterest = 0;
  const maxMonths = Math.max(initialMonths * 3, 600);
  let i = 0;

  while (balance > 0.5 && i < maxMonths) {
    const interest = balance * rate;
    let principal = monthly - interest;
    if (principal < 0) principal = 0;
    if (principal > balance) principal = balance;
    const payment = principal + interest;
    let extraSum = 0;

    // Применяем досрочные платежи в этот месяц
    const monthExtras = extras.filter(e => e.date === month);
    for (const ex of monthExtras) {
      const extraAmount = Math.min(ex.amount, balance - principal);
      if (extraAmount <= 0) continue;
      extraSum += extraAmount;

      if (ex.mode === "reducePayment") {
        // Уменьшаем платёж — пересчитываем аннуитет на оставшийся срок
        const newBalance = balance - principal - extraAmount;
        const monthsLeft = Math.max(1, remainingMonths - 1);
        if (newBalance > 0.5) {
          monthly = annuityPayment(newBalance, rate, monthsLeft);
        }
      } else {
        // Уменьшаем срок — платёж тот же, баланс уменьшается, срок сократится автоматически
      }
    }

    balance = balance - principal - extraSum;
    if (balance < 0.5) balance = 0;

    rows.push({
      month,
      payment: Math.round(payment),
      principal: Math.round(principal),
      interest: Math.round(interest),
      balance: Math.round(balance),
      extra: Math.round(extraSum),
    });

    totalPaid += payment + extraSum;
    totalInterest += interest;
    month = addMonths(month, 1);
    remainingMonths -= 1;
    i += 1;
    if (balance === 0) break;
  }

  const paidCount = (loan.paidMonths || []).length;
  const remaining = rows.slice(paidCount).reduce((s, r) => s + r.payment + r.extra, 0);

  return {
    rows,
    currentMonthly: Math.round(monthly),
    totalToPay: Math.round(totalPaid),
    totalInterest: Math.round(totalInterest),
    remaining: Math.round(remaining),
    monthCount: rows.length,
  };
}
