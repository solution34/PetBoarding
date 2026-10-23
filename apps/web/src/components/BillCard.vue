<script setup lang="ts">
import type { Bill } from '../api/types'
import { formatDateCN, formatDateTime } from '../utils/dates'
import { PAYMENT_METHOD_LABELS, formatFen } from '../utils/format'

defineProps<{
  bill: Bill
  /** 在住预览模式：提示按今日预估。 */
  preview?: boolean
}>()

const paymentLabel = (method: 'cash' | 'transfer'): string =>
  PAYMENT_METHOD_LABELS[method] ?? method
</script>

<template>
  <section class="card">
    <header class="card__header">
      <h2 class="card__title">账单</h2>
      <span v-if="bill.settled" class="badge badge--green">已结单</span>
      <span v-else class="badge badge--amber">待结算</span>
    </header>

    <dl class="bill-lines">
      <div class="bill-lines__row">
        <dt>锁定日价</dt>
        <dd>{{ formatFen(bill.dailyPriceFen) }} / 天</dd>
      </div>
      <div class="bill-lines__row">
        <dt>计划天数</dt>
        <dd>{{ bill.plannedDays }} 天</dd>
      </div>
      <div class="bill-lines__row">
        <dt>基础费</dt>
        <dd>{{ formatFen(bill.baseFeeFen) }}</dd>
      </div>
      <div class="bill-lines__row">
        <dt>逾期天数</dt>
        <dd>{{ bill.overdueDays }} 天</dd>
      </div>
      <div class="bill-lines__row">
        <dt>逾期费</dt>
        <dd>{{ formatFen(bill.overdueFeeFen) }}</dd>
      </div>
      <div class="bill-lines__row bill-lines__total">
        <dt>应收合计</dt>
        <dd>{{ formatFen(bill.totalFen) }}</dd>
      </div>
    </dl>

    <p class="muted">费用计算日：{{ formatDateCN(bill.computedOn) }}
      <span v-if="!bill.settled && preview">（按今日实时预估，离店结单时以实际日期为准）</span>
    </p>
    <p v-if="bill.actualCheckInDate || bill.actualCheckOutDate" class="muted">
      实际入住：{{ bill.actualCheckInDate ?? '—' }} · 实际离店：{{ bill.actualCheckOutDate ?? '—' }}
    </p>

    <div v-if="bill.invoice" class="bill-invoice">
      账单已保存（状态：{{ bill.invoice.status === 'paid' ? '已收款' : bill.invoice.status }}，
      保存时间：{{ formatDateTime(bill.invoice.createdAt) }}）
    </div>

    <div v-if="bill.receipt" class="receipt">
      <h3 class="receipt__title">收款记录</h3>
      <dl class="kv">
        <dt>收款金额</dt>
        <dd class="money">{{ formatFen(bill.receipt.amountFen) }}</dd>
        <dt>收款方式</dt>
        <dd>{{ paymentLabel(bill.receipt.method) }}</dd>
        <dt>收款人</dt>
        <dd>{{ bill.receipt.staffName }}</dd>
        <dt>收款时间</dt>
        <dd>{{ formatDateTime(bill.receipt.paidAt) }}</dd>
      </dl>
    </div>
  </section>
</template>
