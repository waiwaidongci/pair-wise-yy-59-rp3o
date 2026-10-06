import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/* ============================== 密级与人员 ============================== */

export const CLASS_LEVEL = { 内部: 1, 机密: 2, 严格机密: 3 } as const;
export type Classification = keyof typeof CLASS_LEVEL;

export type Role = '去密员' | '复核员' | '发布员';
export type User = { id: string; name: string; role: Role; clearance: Classification; title: string };

export const USERS: User[] = [
  { id: 'U-LQ', name: '林清', role: '复核员', clearance: '机密', title: '审核组 · 兼去密' },
  { id: 'U-ZX', name: '周叙', role: '复核员', clearance: '严格机密', title: '审核组' },
  { id: 'U-SL', name: '沈律', role: '复核员', clearance: '严格机密', title: '资深复核 · 裁决人' },
  { id: 'U-GY', name: '顾言', role: '发布员', clearance: '内部', title: '发布组' },
  { id: 'U-GH', name: '高衡', role: '发布员', clearance: '严格机密', title: '发布组' }
];

/* ============================== 统一授权依据 ============================== */

export type Redaction = {
  id: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  reason: string;
  privilege: string;
  status: 'draft' | 'confirmed';
};

/** 授权依据：文档密级、去密区域、复核结论、发布批次共用的同一条事实源 */
export type Basis = {
  version: number;
  classification: Classification;
  regionFingerprint: string;
  changedAt: string;
  changeNote: string;
};

export type DisclosureRecord = {
  id: string;
  title: string;
  bundle: string;
  pages: number;
  owner: string;
  updatedAt: string;
  issue: string;
  size: string;
  redactions: Redaction[];
  basis: Basis;
};

/* ============================== 复核与待裁决账 ============================== */

export type Signature = {
  reviewerId: string;
  reviewerName: string;
  conclusion: '通过' | '退回补件';
  note: string;
  payloadHash: string;
  at: string;
};

export type Review = {
  docId: string;
  basisVersion: number;
  signatures: Signature[];
  checks: Record<string, boolean>;
};

export type ArbitrationEntry = {
  id: string;
  docId: string;
  basisVersion: number;
  reviewerId: string;
  reviewerName: string;
  conclusion: '通过' | '退回补件';
  note: string;
  region?: Redaction;
  status: '待裁决' | '已采纳' | '已驳回';
  createdAt: string;
  ruledByName?: string;
  ruledAt?: string;
  rulingNote?: string;
};

/* ============================== 发布批次与检查点 ============================== */

export type BatchItemState = '待导出' | '已完成' | '退回等待';
export type BatchItem = {
  docId: string;
  basisVersion: number;
  /** 加入批次时的密级快照；旧批次为 null，必须隔离复核、禁止按今日密级放行 */
  classificationSnapshot: Classification | null;
  state: BatchItemState;
  addedAt: string;
};

export type ExportPhase = '未开始' | '导出中' | '失败' | '已完成';
export type ExportState = {
  phase: ExportPhase;
  completedDocIds: string[];
  currentDocId?: string;
  startedAt?: string;
  finishedAt?: string;
  failedDocId?: string;
  error?: string;
};

export type ReleaseBatch = {
  id: string;
  name: string;
  createdAt: string;
  items: BatchItem[];
  export: ExportState;
};

/* ============================== 审计 ============================== */

export type AuditResult = '允许' | '拒绝' | '系统';
export type AuditEntry = {
  id: string;
  at: string;
  actorName: string;
  action: string;
  target: string;
  result: AuditResult;
  detail: string;
};

export type Notice = { tone: 'ok' | 'deny' | 'info'; text: string; key: number } | null;

export type ActionResult = { ok: boolean; reason?: string };

/* ============================== 纯函数：指纹 / 权限 / 派生状态 ============================== */

function djb2(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

export const fingerprintOf = (redactions: Redaction[]): string =>
  djb2(JSON.stringify(redactions.map((r) => [r.page, r.x, r.y, r.width, r.height, r.reason, r.privilege, r.status])));

export const canViewLevel = (user: User, level: Classification): boolean =>
  CLASS_LEVEL[user.clearance] >= CLASS_LEVEL[level];
export const canViewDoc = (user: User, doc: DisclosureRecord): boolean => canViewLevel(user, doc.basis.classification);
export const canEditDoc = (user: User, doc: DisclosureRecord): boolean =>
  user.role !== '发布员' && canViewDoc(user, doc);
export const canReviewDoc = (user: User, doc: DisclosureRecord): boolean =>
  user.role === '复核员' && canViewDoc(user, doc);

export const requiredSignatures = (doc: DisclosureRecord): number =>
  doc.basis.classification === '内部' ? 1 : 2;

export const isReviewActive = (doc: DisclosureRecord, review?: Review): boolean =>
  !!review && review.basisVersion === doc.basis.version;

export type DocStatus = '去密中' | '待质检' | '可发布' | '复核失效';

export function docStatus(doc: DisclosureRecord, review?: Review): DocStatus {
  const hasDraft = doc.redactions.some((r) => r.status === 'draft');
  if (!review) return hasDraft ? '去密中' : '待质检';
  if (review.basisVersion !== doc.basis.version) return '复核失效';
  const passed = review.signatures.filter((s) => s.conclusion === '通过').length;
  if (passed >= requiredSignatures(doc) && !hasDraft) return '可发布';
  return review.signatures.length > 0 ? '待质检' : hasDraft ? '去密中' : '待质检';
}

export type BatchDisplayStatus = '隔离待复核' | '待导出' | '退回等待' | '导出中' | '导出失败' | '已完成';

export function batchStatus(batch: ReleaseBatch): BatchDisplayStatus {
  if (batch.items.some((i) => i.classificationSnapshot === null)) return '隔离待复核';
  if (batch.export.phase === '已完成') return '已完成';
  if (batch.export.phase === '导出中') return '导出中';
  if (batch.export.phase === '失败') return '导出失败';
  if (batch.items.some((i) => i.state === '退回等待')) return '退回等待';
  return '待导出';
}

export const REVIEW_CHECKS = [
  { id: 'forbidden-terms', label: '全文禁词与姓名复核', detail: '扫描原始页和发布页文本层' },
  { id: 'page-number', label: '页序与页码连续性', detail: '检查拆页、合并及漏页情况' },
  { id: 'image-boundary', label: '图像边界残片', detail: '逐页比较遮蔽边界 2mm 区域' },
  { id: 'metadata', label: '文档元数据清理', detail: '作者、修订人、批注和隐藏字段' }
];

/* ============================== 初始数据 ============================== */

const now = (): string => new Date().toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
const uid = (prefix: string): string => `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

function basis(version: number, classification: Classification, redactions: Redaction[], changedAt: string, changeNote: string): Basis {
  return { version, classification, regionFingerprint: fingerprintOf(redactions), changedAt, changeNote };
}

const defaultRedactions: Record<string, Redaction[]> = {
  'DOC-00418': [
    { id: 'R-01', page: 1, x: 0.12, y: 0.16, width: 0.3, height: 0.04, reason: '商业秘密', privilege: '合同保密', status: 'confirmed' },
    { id: 'R-02', page: 1, x: 0.5, y: 0.43, width: 0.34, height: 0.06, reason: '个人手机号', privilege: '个人信息', status: 'draft' },
    { id: 'R-03', page: 2, x: 0.11, y: 0.25, width: 0.68, height: 0.05, reason: '第三方报价', privilege: '商业敏感', status: 'confirmed' }
  ],
  'DOC-00427': [
    { id: 'R-04', page: 1, x: 0.08, y: 0.69, width: 0.74, height: 0.05, reason: '内部调查意见', privilege: '工作成果', status: 'confirmed' }
  ],
  'DOC-00435': [
    { id: 'R-05', page: 2, x: 0.44, y: 0.56, width: 0.26, height: 0.04, reason: '人员姓名', privilege: '个人信息', status: 'confirmed' }
  ]
};

const allChecks = (): Record<string, boolean> =>
  REVIEW_CHECKS.reduce<Record<string, boolean>>((acc, item) => { acc[item.id] = true; return acc; }, {});

function buildInitialState() {
  const r418 = defaultRedactions['DOC-00418'];
  const r427 = defaultRedactions['DOC-00427'];
  const r435 = defaultRedactions['DOC-00435'];

  const documents: DisclosureRecord[] = [
    {
      id: 'DOC-00418', title: '设备采购补充协议（第三版）', bundle: '北岭项目 · 第一批披露', pages: 3,
      owner: '林清', updatedAt: '09:48', issue: '合同主体与商业条款', size: '8.4 MB',
      redactions: r418, basis: basis(1, '严格机密', r418, '09-30 09:48', '建档定级')
    },
    {
      id: 'DOC-00427', title: '现场会议纪要 2026-08-19', bundle: '北岭项目 · 第一批披露', pages: 3,
      owner: '周叙', updatedAt: '09:31', issue: '事故预防与整改安排', size: '3.1 MB',
      redactions: r427, basis: basis(2, '机密', r427, '09-30 09:31', '补充调查意见遮蔽区')
    },
    {
      id: 'DOC-00435', title: '设备运行数据摘录', bundle: '北岭项目 · 第二批披露', pages: 3,
      owner: '顾言', updatedAt: '08:56', issue: '运行记录', size: '12.7 MB',
      redactions: r435, basis: basis(3, '内部', r435, '09-29 17:02', '人员姓名去密确认')
    }
  ];

  const reviews: Record<string, Review> = {
    'DOC-00427': {
      docId: 'DOC-00427', basisVersion: 2, checks: allChecks(),
      signatures: [
        { reviewerId: 'U-ZX', reviewerName: '周叙', conclusion: '通过', note: '遮蔽边界与页码核对无误', payloadHash: 'seed-427', at: '09:31:40' },
        { reviewerId: 'U-LQ', reviewerName: '林清', conclusion: '通过', note: '遮蔽边界与页码核对无误', payloadHash: 'seed-427', at: '09:34:02' }
      ]
    },
    'DOC-00435': {
      docId: 'DOC-00435', basisVersion: 3, checks: allChecks(),
      signatures: [{ reviewerId: 'U-LQ', reviewerName: '林清', conclusion: '通过', note: '运行记录复核通过', payloadHash: 'seed-435', at: '08:54:12' }]
    }
  };

  const batches: ReleaseBatch[] = [
    {
      id: 'BATCH-01', name: '第一批披露 · 历史批次', createdAt: '09-25 14:02:00',
      items: [
        { docId: 'DOC-00418', basisVersion: 0, classificationSnapshot: null, state: '待导出', addedAt: '09-25 14:02:00' }
      ],
      export: { phase: '未开始', completedDocIds: [] }
    },
    {
      id: 'BATCH-02', name: '第二批披露 · 编制中', createdAt: '09-30 08:20:00',
      items: [
        { docId: 'DOC-00418', basisVersion: 1, classificationSnapshot: '严格机密', state: '待导出', addedAt: '09-30 08:21:00' },
        { docId: 'DOC-00427', basisVersion: 2, classificationSnapshot: '机密', state: '待导出', addedAt: '09-30 08:22:00' }
      ],
      export: { phase: '未开始', completedDocIds: [] }
    },
    {
      id: 'BATCH-03', name: '专家报告附件 · 待导出', createdAt: '09-30 09:10:00',
      items: [
        { docId: 'DOC-00435', basisVersion: 3, classificationSnapshot: '内部', state: '待导出', addedAt: '09-30 09:11:00' },
        { docId: 'DOC-00427', basisVersion: 2, classificationSnapshot: '机密', state: '待导出', addedAt: '09-30 09:12:00' }
      ],
      export: { phase: '未开始', completedDocIds: [] }
    }
  ];

  const audits: AuditEntry[] = [
    { id: uid('A'), at: '09:48:02', actorName: '林清', action: '确认去密区域', target: 'DOC-00418 / R-01', result: '允许', detail: '合同价款遮蔽区域确认，依据 v1 未变' },
    { id: uid('A'), at: '09:31:40', actorName: '周叙', action: '提交复核结论', target: 'DOC-00427', result: '允许', detail: '占用依据 v2，结论通过（1/2 签名）' },
    { id: uid('A'), at: '08:54:30', actorName: '顾言', action: '导出发布清单', target: 'DOC-00435', result: '允许', detail: '导出检查点完成，密级快照 内部' }
  ];

  return {
    documents,
    reviews,
    arbitrations: [] as ArbitrationEntry[],
    batches,
    audits,
    /** 导出故障注入：下一次导出处理到该文档时模拟一次传输失败 */
    failInjectionDocId: 'DOC-00427' as string | null
  };
}

/* ============================== Store ============================== */

type State = {
  currentUserId: string;
  documents: DisclosureRecord[];
  reviews: Record<string, Review>;
  arbitrations: ArbitrationEntry[];
  batches: ReleaseBatch[];
  audits: AuditEntry[];
  failInjectionDocId: string | null;
  notice: Notice;

  // 阅览 UI 状态
  activeDocumentId: string;
  activePage: number;
  activeRedactionId: string | null;
  redactionMode: boolean;

  switchUser: (id: string) => void;
  clearNotice: () => void;
  resetDemo: () => void;

  selectDocument: (id: string) => ActionResult;
  setPage: (page: number) => void;
  selectRedaction: (id: string) => void;
  toggleRedactionMode: () => ActionResult;

  addRedaction: (redaction: Omit<Redaction, 'id' | 'status'>) => ActionResult;
  confirmRedaction: (id: string) => ActionResult;
  updateClassification: (classification: Classification) => ActionResult;
  submitReview: (input: {
    conclusion: '通过' | '退回补件';
    note: string;
    checks: Record<string, boolean>;
    region?: Omit<Redaction, 'id' | 'status'>;
  }) => ActionResult;
  adjudicate: (entryId: string, decision: '采纳' | '驳回', rulingNote: string) => ActionResult;

  addToBatch: (batchId: string, docId: string) => ActionResult;
  removeFromBatch: (batchId: string, docId: string) => void;
  setFailInjection: (docId: string | null) => void;
  startExport: (batchId: string) => ActionResult;
  retryExport: (batchId: string) => ActionResult;
  quarantineResnapshot: (batchId: string, docId: string, snapshot: Classification, note: string) => ActionResult;
};

const timers: Record<string, ReturnType<typeof setTimeout>> = {};
const seed = buildInitialState();

export const useDisclosureStore = create<State>()(
  persist(
    (set, get) => {
      const currentUser = (): User => USERS.find((u) => u.id === get().currentUserId) ?? USERS[0];
      const findDoc = (id: string): DisclosureRecord | undefined => get().documents.find((d) => d.id === id);

      const notify = (notice: Exclude<Notice, null>) => set({ notice });
      const pushAudit = (entry: Omit<AuditEntry, 'id' | 'at' | 'actorName'>) => {
        const actor = currentUser();
        const full: AuditEntry = { id: uid('A'), at: now(), actorName: actor.name, ...entry };
        set((state) => ({ audits: [full, ...state.audits].slice(0, 200) }));
        return full;
      };

      /** 拒绝：写审计 + 弹提示，不改变任何业务数据 */
      const deny = (action: string, target: string, detail: string): ActionResult => {
        pushAudit({ action, target, result: '拒绝', detail });
        notify({ tone: 'deny', key: Date.now(), text: `已拒绝并记录审计：${detail}` });
        return { ok: false, reason: detail };
      };
      const ok = (text?: string): ActionResult => {
        if (text) notify({ tone: 'ok', key: Date.now(), text });
        return { ok: true };
      };

      /** 依据升级：密级或区域变化后，相关复核失效、未导出批次条目退回等待，其他文档不动 */
      const bumpBasis = (
        docId: string,
        patch: { classification?: Classification; redactions?: Redaction[] },
        changeNote: string
      ): number => {
        const state = get();
        const doc = state.documents.find((d) => d.id === docId)!;
        const redactions = patch.redactions ?? doc.redactions;
        const classification = patch.classification ?? doc.basis.classification;
        const newVersion = doc.basis.version + 1;
        let returned = 0;
        const documents = state.documents.map((d) =>
          d.id === docId
            ? {
                ...d,
                ...(patch.redactions ? { redactions } : {}),
                basis: { version: newVersion, classification, regionFingerprint: fingerprintOf(redactions), changedAt: now(), changeNote }
              }
            : d
        );
        const batches = state.batches.map((batch) => {
          let touched = false;
          const items = batch.items.map((item) => {
            if (item.docId === docId && item.state !== '已完成' && item.classificationSnapshot !== null) {
              touched = true;
              returned += 1;
              return { ...item, state: '退回等待' as const };
            }
            return item;
          });
          // 依据一旦变化，导出若停在检查点，需要重新整体放行
          const exportState =
            touched && (batch.export.phase === '导出中' || batch.export.phase === '失败')
              ? { ...batch.export, phase: '失败' as const, error: `授权依据已变更（${docId} v${newVersion}），检查点暂停等待复核` }
              : batch.export;
          return touched || exportState !== batch.export ? { ...batch, items, export: exportState } : batch;
        });
        set({ documents, batches });
        pushAudit({
          action: '授权依据变更',
          target: docId,
          result: '允许',
          detail: `依据升至 v${newVersion}（${changeNote}）；原复核结论失效，${returned} 个待导出批次条目退回等待；已完成导出与其他文档不受影响`
        });
        return newVersion;
      };

      /** 复核重新达标后，退回等待的批次条目携带新依据版本与新密级快照回到待导出 */
      const recoverWaitingItems = (docId: string) => {
        const state = get();
        const doc = state.documents.find((d) => d.id === docId);
        const review = state.reviews[docId];
        if (!doc || !isReviewActive(doc, review)) return;
        const hasDraft = doc.redactions.some((r) => r.status === 'draft');
        const passed = review.signatures.filter((s) => s.conclusion === '通过').length;
        if (hasDraft || passed < requiredSignatures(doc)) return;
        let recovered = 0;
        const batches = state.batches.map((batch) => {
          let touched = false;
          const items = batch.items.map((item) => {
            if (item.docId === docId && item.state === '退回等待') {
              touched = true;
              recovered += 1;
              return { ...item, state: '待导出' as const, basisVersion: doc.basis.version, classificationSnapshot: doc.basis.classification };
            }
            return item;
          });
          return touched ? { ...batch, items } : batch;
        });
        if (recovered > 0) {
          set({ batches });
          pushAudit({ action: '批次条目恢复', target: docId, result: '允许', detail: `${recovered} 个退回等待条目按依据 v${doc.basis.version} 恢复待导出` });
        }
      };

      const validateExport = (batch: ReleaseBatch, actor: User): ActionResult => {
        if (actor.role !== '发布员') return deny('导出发布批次', batch.id, `仅发布员可导出，${actor.name} 的角色是${actor.role}`);
        const quarantined = batch.items.filter((i) => i.classificationSnapshot === null);
        if (quarantined.length > 0) {
          return deny('导出发布批次', batch.id, `批次含 ${quarantined.length} 份缺少密级快照的历史文档，已隔离待复核，不得按今日密级放行`);
        }
        const waiting = batch.items.filter((i) => i.state === '退回等待');
        if (waiting.length > 0) {
          return deny('导出发布批次', batch.id, `批次含 ${waiting.length} 份授权依据变化后退回等待的文档（${waiting.map((i) => i.docId).join('、')}），需重新复核`);
        }
        // 复核门禁：未复核、依据版本不符、签名不足、仍有草稿区域，一律不得导出
        const state = get();
        const notReady = batch.items
          .filter((i) => i.state !== '已完成')
          .filter((i) => {
            const d = state.documents.find((x) => x.id === i.docId);
            const r = state.reviews[i.docId];
            if (!d) return true;
            if (d.redactions.some((x) => x.status === 'draft')) return true;
            if (!r || r.basisVersion !== d.basis.version) return true;
            return r.signatures.filter((s) => s.conclusion === '通过').length < requiredSignatures(d);
          });
        if (notReady.length > 0) {
          return deny('导出发布批次', batch.id, `批次含 ${notReady.length} 份复核未达标的文档（${notReady.map((i) => i.docId).join('、')}）：须基于当前依据完成规定签名且无草稿区域`);
        }
        const noRight = batch.items.filter(
          (i) => i.state !== '已完成' && CLASS_LEVEL[i.classificationSnapshot as Classification] > CLASS_LEVEL[actor.clearance]
        );
        if (noRight.length > 0) {
          return deny('导出发布批次', batch.id, `批次夹带 ${noRight.length} 份无权导出文档（${noRight.map((i) => `${i.docId}[${i.classificationSnapshot}]`).join('、')}），${actor.name} 的授权密级为${actor.clearance}`);
        }
        return { ok: true };
      };

      const scheduleTick = (batchId: string) => {
        timers[batchId] = setTimeout(() => {
          const state = get();
          const batch = state.batches.find((b) => b.id === batchId);
          if (!batch || batch.export.phase !== '导出中') return;
          const pending = batch.items.filter((i) => i.state === '待导出');
          if (pending.length === 0) {
            const batches = state.batches.map((b) =>
              b.id === batchId ? { ...b, export: { ...b.export, phase: '已完成' as const, currentDocId: undefined, finishedAt: now(), error: undefined } } : b
            );
            set({ batches });
            pushAudit({ action: '导出发布批次', target: batchId, result: '允许', detail: `批次全部导出完成（${batch.items.length}/${batch.items.length}）` });
            notify({ tone: 'ok', key: Date.now(), text: `批次 ${batchId} 全部导出完成` });
            return;
          }
          const item = pending[0];
          // 导出故障注入：暂停于检查点，已完成文档保留
          if (state.failInjectionDocId === item.docId) {
            const batches = state.batches.map((b) =>
              b.id === batchId
                ? {
                    ...b,
                    export: {
                      ...b.export,
                      phase: '失败' as const,
                      currentDocId: item.docId,
                      failedDocId: item.docId,
                      error: `传输故障：${item.docId} 导出中断，已暂停于检查点（${b.export.completedDocIds.length}/${b.items.length} 完成）`
                    }
                  }
                : b
            );
            set({ batches, failInjectionDocId: null });
            pushAudit({ action: '导出发布批次', target: `${batchId} / ${item.docId}`, result: '系统', detail: `传输故障，导出暂停于检查点；已完成 ${batch.export.completedDocIds.length} 份，可从检查点重试` });
            notify({ tone: 'deny', key: Date.now(), text: `导出故障：${item.docId} 中断，检查点已保存，可重试` });
            return;
          }
          // 导出途中再次鉴权：防止切换账号或密级变化后夹带
          const actor = currentUser();
          if (CLASS_LEVEL[item.classificationSnapshot as Classification] > CLASS_LEVEL[actor.clearance]) {
            const batches = state.batches.map((b) =>
              b.id === batchId ? { ...b, export: { ...b.export, phase: '失败' as const, currentDocId: item.docId, error: `导出途中鉴权失败：${actor.name} 无权导出 ${item.docId}[${item.classificationSnapshot}]` } } : b
            );
            set({ batches });
            deny('导出发布批次', `${batchId} / ${item.docId}`, `导出途中鉴权失败：${actor.name}（${actor.clearance}）无权导出该文档`);
            return;
          }
          const items = batch.items.map((i) => (i.docId === item.docId ? { ...i, state: '已完成' as const } : i));
          const completedDocIds = Array.from(new Set([...batch.export.completedDocIds, item.docId]));
          const batches = state.batches.map((b) =>
            b.id === batchId ? { ...b, items, export: { ...b.export, currentDocId: item.docId, completedDocIds } } : b
          );
          set({ batches });
          pushAudit({ action: '导出检查点', target: `${batchId} / ${item.docId}`, result: '允许', detail: `${item.docId} 导出完成（${completedDocIds.length}/${batch.items.length}，快照 ${item.classificationSnapshot}）` });
          scheduleTick(batchId);
        }, 650);
      };

      return {
        ...seed,
        currentUserId: 'U-LQ',
        notice: null,
        activeDocumentId: 'DOC-00418',
        activePage: 1,
        activeRedactionId: null,
        redactionMode: false,

        switchUser: (id) => {
          const user = USERS.find((u) => u.id === id);
          if (!user) return;
          set({ currentUserId: id, notice: { tone: 'info', key: Date.now(), text: `当前操作人：${user.name} · ${user.role} · 授权密级 ${user.clearance}` } });
        },
        clearNotice: () => set({ notice: null }),
        resetDemo: () => {
          Object.values(timers).forEach(clearTimeout);
          const fresh = buildInitialState();
          set({
            ...fresh,
            notice: { tone: 'info', key: Date.now(), text: '演示数据已重置' },
            activeDocumentId: 'DOC-00418',
            activePage: 1,
            activeRedactionId: null,
            redactionMode: false
          });
        },

        selectDocument: (id) => {
          const actor = currentUser();
          const doc = findDoc(id);
          if (!doc) return { ok: false };
          if (!canViewDoc(actor, doc)) {
            return deny('查看文档', doc.id, `${actor.name}（${actor.clearance}）无权查看${doc.basis.classification}材料 ${doc.id}`);
          }
          set({ activeDocumentId: id, activePage: 1, activeRedactionId: null, redactionMode: false });
          return { ok: true };
        },
        setPage: (page) => set({ activePage: page }),
        selectRedaction: (id) => set({ activeRedactionId: id }),
        toggleRedactionMode: () => {
          const actor = currentUser();
          const doc = findDoc(get().activeDocumentId);
          if (doc && !canEditDoc(actor, doc)) {
            return deny('修改去密区域', doc.id, `${actor.name}（${actor.role}/${actor.clearance}）无权在该文档上绘制去密区`);
          }
          set((state) => ({ redactionMode: !state.redactionMode }));
          return { ok: true };
        },

        addRedaction: (redaction) => {
          const actor = currentUser();
          const doc = findDoc(get().activeDocumentId);
          if (!doc) return { ok: false };
          if (!canEditDoc(actor, doc)) {
            return deny('修改去密区域', doc.id, `${actor.name}（${actor.role}/${actor.clearance}）无权修改该文档的去密区域`);
          }
          const full: Redaction = { ...redaction, id: uid('R'), status: 'draft' };
          bumpBasis(doc.id, { redactions: [...doc.redactions, full] }, `新增${redaction.reason}去密区域（草稿）`);
          set({ activeRedactionId: full.id });
          return ok(`已新增区域，授权依据升至 v${doc.basis.version + 1}：原复核失效、待导出批次已退回等待`);
        },

        confirmRedaction: (id) => {
          const actor = currentUser();
          const doc = get().documents.find((d) => d.redactions.some((r) => r.id === id));
          if (!doc) return { ok: false };
          if (!canEditDoc(actor, doc)) {
            return deny('修改去密区域', `${doc.id} / ${id}`, `${actor.name} 无权确认该文档的去密区域`);
          }
          // 确认区域不改变区域内容本身，不升级依据版本
          set((state) => ({
            documents: state.documents.map((d) => ({
              ...d,
              redactions: d.redactions.map((r) => (r.id === id ? { ...r, status: 'confirmed' as const } : r))
            }))
          }));
          pushAudit({ action: '确认去密区域', target: `${doc.id} / ${id}`, result: '允许', detail: `区域确认，依据 v${doc.basis.version} 不变` });
          recoverWaitingItems(doc.id);
          return ok();
        },

        updateClassification: (classification) => {
          const actor = currentUser();
          const doc = findDoc(get().activeDocumentId);
          if (!doc) return { ok: false };
          if (!canEditDoc(actor, doc)) {
            return deny('修改文档密级', doc.id, `${actor.name}（${actor.role}/${actor.clearance}）无权调整该文档密级`);
          }
          if (doc.basis.classification === classification) return { ok: true };
          bumpBasis(doc.id, { classification }, `密级由 ${doc.basis.classification} 调整为 ${classification}`);
          return ok(`密级已变更，依据升至 v${doc.basis.version + 1}：原复核失效、待导出批次退回等待`);
        },

        submitReview: ({ conclusion, note, checks, region }) => {
          const actor = currentUser();
          const doc = findDoc(get().activeDocumentId);
          if (!doc) return { ok: false };
          if (!canReviewDoc(actor, doc)) {
            return deny('提交复核结论', doc.id, `${actor.name}（${actor.role}/${actor.clearance}）无权复核${doc.basis.classification}文档`);
          }
          if (!note.trim()) return deny('提交复核结论', doc.id, '复核意见/理由不能为空');
          const state = get();
          const existing = state.reviews[doc.id];
          const at = now();
          const regionPayload = region ? { ...region, id: 'PENDING', status: 'draft' as const } : undefined;
          const payloadHash = djb2(JSON.stringify([conclusion, note.trim(), region ? [region.page, region.x, region.y, region.reason] : null, checks]));
          const signature: Signature = { reviewerId: actor.id, reviewerName: actor.name, conclusion, note: note.trim(), payloadHash, at };

          // 无复核记录，或依据已升级导致旧复核失效：先提交者占用当前依据
          if (!existing || existing.basisVersion !== doc.basis.version) {
            const review: Review = { docId: doc.id, basisVersion: doc.basis.version, signatures: [signature], checks };
            set({ reviews: { ...state.reviews, [doc.id]: review } });
            pushAudit({ action: '提交复核结论', target: doc.id, result: '允许', detail: `${actor.name} 先提交，占用依据 v${doc.basis.version}，结论${conclusion}（1/${requiredSignatures(doc)} 签名）` });
            recoverWaitingItems(doc.id);
            return ok(`复核已接受：你已占用依据 v${doc.basis.version}（先提交者）`);
          }

          // 同一依据版本上的并发提交
          if (existing.signatures.some((s) => s.reviewerId === actor.id)) {
            return deny('提交复核结论', doc.id, '你已在当前依据版本上签署，不能重复提交或覆盖已接受内容');
          }
          const first = existing.signatures[0];
          const samePayload = first.payloadHash === payloadHash && !regionPayload;
          if (samePayload) {
            // 内容一致：作为会签接受，满足双人复核，不覆盖先提交者
            const mergedChecks = { ...existing.checks, ...checks };
            const review: Review = { ...existing, signatures: [...existing.signatures, signature], checks: mergedChecks };
            set({ reviews: { ...state.reviews, [doc.id]: review } });
            pushAudit({ action: '复核会签', target: doc.id, result: '允许', detail: `${actor.name} 会签通过，与先提交者 ${first.reviewerName} 内容一致（${review.signatures.length}/${requiredSignatures(doc)} 签名）` });
            recoverWaitingItems(doc.id);
            return ok(`会签已接受（${review.signatures.length}/${requiredSignatures(doc)} 签名），已接受内容未被覆盖`);
          }

          // 内容冲突：后到者的区域和理由进入待裁决账，绝不覆盖已接受内容
          const entry: ArbitrationEntry = {
            id: uid('ARB'),
            docId: doc.id,
            basisVersion: doc.basis.version,
            reviewerId: actor.id,
            reviewerName: actor.name,
            conclusion,
            note: note.trim(),
            region: regionPayload,
            status: '待裁决',
            createdAt: at
          };
          set({ arbitrations: [entry, ...state.arbitrations] });
          pushAudit({ action: '并发提交转裁决', target: doc.id, result: '允许', detail: `${actor.name} 后到且内容与已接受结论不同，区域与理由进入待裁决账 ${entry.id}；先提交者 ${first.reviewerName} 已占用依据 v${doc.basis.version}，已接受内容保持不变` });
          return ok(`提交与已接受结论存在差异，已进入待裁决账（${entry.id}），不会覆盖先提交者内容`);
        },

        adjudicate: (entryId, decision, rulingNote) => {
          const actor = currentUser();
          const entry = get().arbitrations.find((e) => e.id === entryId);
          if (!entry) return { ok: false };
          const doc = findDoc(entry.docId);
          if (!doc) return { ok: false };
          if (!canReviewDoc(actor, doc)) {
            return deny('裁决待裁决条目', entryId, `${actor.name}（${actor.clearance}）无权裁决${doc.basis.classification}文档的争议`);
          }
          if (actor.id === entry.reviewerId) {
            return deny('裁决待裁决条目', entryId, '裁决人不能是该条目的提交人，请换由其他复核员裁决');
          }
          if (entry.status !== '待裁决') return deny('裁决待裁决条目', entryId, '该条目已裁决');
          if (!rulingNote.trim()) return deny('裁决待裁决条目', entryId, '裁决理由不能为空');

          if (decision === '采纳' && entry.region) {
            // 采纳的后到者区域写入文档 → 区域变化 → 依据升级 → 既有复核失效、批次退回
            const full: Redaction = { ...entry.region, id: uid('R'), status: 'draft' };
            bumpBasis(doc.id, { redactions: [...doc.redactions, full] }, `裁决采纳 ${entry.reviewerName} 的去密区域建议` );
          } else if (decision === '采纳') {
            // 无区域的不同理由被采纳：结论本身变化也使依据升级
            bumpBasis(doc.id, {}, `裁决采纳 ${entry.reviewerName} 的复核理由：${entry.note.slice(0, 20)}`);
          }

          set((state) => ({
            arbitrations: state.arbitrations.map((e) =>
              e.id === entryId ? { ...e, status: decision === '采纳' ? '已采纳' as const : '已驳回' as const, ruledByName: actor.name, ruledAt: now(), rulingNote: rulingNote.trim() } : e
            )
          }));
          pushAudit({
            action: '裁决待裁决条目',
            target: entryId,
            result: '允许',
            detail: `${actor.name} ${decision} ${entry.reviewerName} 对 ${entry.docId} 的差异提交${decision === '采纳' ? '，授权依据已升级，原复核失效、批次退回等待' : '，维持先提交者已接受内容'}：${rulingNote.trim()}`
          });
          return ok(decision === '采纳' ? '已采纳：争议内容写入并升级授权依据，原复核失效、批次退回等待' : '已驳回：先提交者的已接受内容保持不变');
        },

        addToBatch: (batchId, docId) => {
          const actor = currentUser();
          const batch = get().batches.find((b) => b.id === batchId);
          const doc = findDoc(docId);
          if (!batch || !doc) return { ok: false };
          if (!canViewDoc(actor, doc)) {
            return deny('加入发布批次', `${batchId} / ${docId}`, `${actor.name}（${actor.clearance}）无权查看${doc.basis.classification}文档，禁止夹带入批次`);
          }
          if (batch.items.some((i) => i.docId === docId)) {
            return deny('加入发布批次', `${batchId} / ${docId}`, '同一文档已在该批次中，禁止重复加入');
          }
          const item: BatchItem = { docId, basisVersion: doc.basis.version, classificationSnapshot: doc.basis.classification, state: '待导出', addedAt: now() };
          set((state) => ({ batches: state.batches.map((b) => (b.id === batchId ? { ...b, items: [...b.items, item] } : b)) }));
          pushAudit({ action: '加入发布批次', target: `${batchId} / ${docId}`, result: '允许', detail: `写入密级快照 ${doc.basis.classification}、依据 v${doc.basis.version}` });
          return ok(`${doc.id} 已加入批次，密级快照 ${doc.basis.classification}`);
        },

        removeFromBatch: (batchId, docId) =>
          set((state) => ({
            batches: state.batches.map((b) =>
              b.id === batchId ? { ...b, items: b.items.filter((i) => i.docId !== docId) } : b
            )
          })),

        setFailInjection: (docId) => set({ failInjectionDocId: docId }),

        startExport: (batchId) => {
          const batch = get().batches.find((b) => b.id === batchId);
          if (!batch) return { ok: false };
          if (batch.export.phase === '导出中') return { ok: false, reason: '批次正在导出中' };
          const guard = validateExport(batch, currentUser());
          if (!guard.ok) return guard;
          const startedAt = batch.export.startedAt ?? now();
          set((state) => ({
            batches: state.batches.map((b) =>
              b.id === batchId ? { ...b, export: { ...b.export, phase: '导出中' as const, startedAt, error: undefined, failedDocId: undefined } } : b
            )
          }));
          pushAudit({
            action: '导出发布批次',
            target: batchId,
            result: '允许',
            detail: `开始导出，共 ${batch.items.length} 份，检查点已完成 ${batch.export.completedDocIds.length} 份，从下一文档继续`
          });
          scheduleTick(batchId);
          return ok(`批次开始导出（从检查点 ${batch.export.completedDocIds.length}/${batch.items.length} 继续）`);
        },

        retryExport: (batchId) => {
          const batch = get().batches.find((b) => b.id === batchId);
          if (!batch) return { ok: false };
          if (batch.export.phase !== '失败') return { ok: false, reason: '仅失败的批次可从检查点重试' };
          const guard = validateExport(batch, currentUser());
          if (!guard.ok) return guard;
          // 检查点：已完成的文档保持完成态，重试不会重复导出
          set((state) => ({
            batches: state.batches.map((b) =>
              b.id === batchId ? { ...b, export: { ...b.export, phase: '导出中' as const, error: undefined } } : b
            )
          }));
          pushAudit({ action: '导出重试', target: batchId, result: '允许', detail: `从检查点重试，跳过已完成 ${batch.export.completedDocIds.length} 份（${batch.export.completedDocIds.join('、') || '无'}），仅导出剩余文档` });
          scheduleTick(batchId);
          return ok(`从检查点重试：已完成的 ${batch.export.completedDocIds.length} 份不会重复导出`);
        },

        quarantineResnapshot: (batchId, docId, snapshot, note) => {
          const actor = currentUser();
          const batch = get().batches.find((b) => b.id === batchId);
          const doc = findDoc(docId);
          if (!batch || !doc) return { ok: false };
          const item = batch.items.find((i) => i.docId === docId);
          if (!item) return { ok: false };
          if (item.classificationSnapshot !== null) return { ok: false, reason: '该条目已有密级快照，无需隔离复核' };
          if (!canReviewDoc(actor, doc)) {
            return deny('隔离复核补录密级快照', `${batchId} / ${docId}`, `${actor.name}（${actor.role}/${actor.clearance}）无权执行隔离复核`);
          }
          if (!note.trim()) return deny('隔离复核补录密级快照', `${batchId} / ${docId}`, '必须填写隔离复核说明，不能直接按今日密级放行');
          if (!canViewLevel(actor, snapshot)) {
            return deny('隔离复核补录密级快照', `${batchId} / ${docId}`, `复核人密级 ${actor.clearance} 低于所确认快照 ${snapshot}`);
          }
          set((state) => ({
            batches: state.batches.map((b) =>
              b.id === batchId
                ? {
                    ...b,
                    items: b.items.map((i) =>
                      i.docId === docId
                        ? { ...i, classificationSnapshot: snapshot, basisVersion: doc.basis.version, state: '待导出' as const }
                        : i
                    ),
                    export: { ...b.export, phase: '未开始' as const, error: undefined }
                  }
                : b
            )
          }));
          pushAudit({ action: '隔离复核补录快照', target: `${batchId} / ${docId}`, result: '允许', detail: `历史文档经 ${actor.name} 隔离复核后补录密级快照 ${snapshot}（依据 v${doc.basis.version}）：${note.trim()}` });
          return ok(`隔离复核完成，已补录快照 ${snapshot}，批次解除隔离`);
        }
      };
    },
    {
      name: 'yy59-authorization-v2',
      partialize: (state) => ({
        currentUserId: state.currentUserId,
        documents: state.documents,
        reviews: state.reviews,
        arbitrations: state.arbitrations,
        batches: state.batches,
        audits: state.audits,
        failInjectionDocId: state.failInjectionDocId
      })
    }
  )
);
