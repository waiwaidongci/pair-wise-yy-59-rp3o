import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { can, actorName, type Role, type Permission } from './auth';

export type Classification = '内部' | '机密' | '严格机密';

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

export type DisclosureRecord = {
  id: string;
  title: string;
  bundle: string;
  pages: number;
  classification: Classification;
  owner: string;
  updatedAt: string;
  status: '去密中' | '待质检' | '可发布';
  issue: string;
  size: string;
  redactions: Redaction[];
  /** 当前有效授权依据 ID */
  basisId: string;
};

/**
 * 授权依据：文档密级、去密区域、复核结论、发布批次共用的一条授权依据。
 * 密级或区域变化 → 依据失效 → 相关复核失效、待导出批次退回等待。
 */
export type AuthBasis = {
  id: string;
  documentId: string;
  classification: Classification;
  redactionHash: string;
  version: number;
  status: '有效' | '已失效';
  createdAt: string;
  invalidatedAt?: string;
  invalidatedReason?: string;
};

/** 复核结论：引用授权依据。同一依据被首个提交者占用，后到者进待裁决账。 */
export type ReviewConclusion = {
  id: string;
  basisId: string;
  documentId: string;
  reviewer: string;
  result: '通过' | '退回';
  submittedAt: string;
  status: '已接受' | '待裁决' | '已失效';
  /** 待裁决提交带来的区域与理由 */
  pendingRedactions?: Redaction[];
  pendingReason?: string;
};

/** 待裁决账：后到复核员的区域和理由，不能覆盖已接受内容。 */
export type AdjudicationEntry = {
  id: string;
  documentId: string;
  basisId: string;
  reviewer: string;
  redactions: Redaction[];
  reason: string;
  submittedAt: string;
  status: '待裁决' | '已裁决';
};

export type AuditEntry = {
  id: string;
  timestamp: string;
  actor: string;
  role: Role;
  action: Permission | '提交复核' | '密级变更' | '区域变更' | '批次隔离' | '导出重试';
  resource: string;
  result: '允许' | '拒绝';
  reason?: string;
};

export type ReleaseBatch = {
  id: string;
  name: string;
  documentIds: string[];
  status: '等待' | '导出中' | '已导出' | '已隔离';
  /** 批次创建时的密级快照；旧批次可能缺失 */
  hasSnapshot: boolean;
  classificationSnapshot?: Record<string, Classification>;
  /** 检查点：已成功导出的文档数，重试从此继续 */
  exportCheckpoint: number;
  exportedAt?: string;
};

/* ---------- helpers ---------- */

function hashRedactions(redactions: Redaction[]): string {
  const str = redactions
    .map((r) => `${r.page}:${r.x}:${r.y}:${r.width}:${r.height}:${r.reason}:${r.privilege}:${r.status}`)
    .sort()
    .join('|');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return `R-${Math.abs(hash).toString(16).toUpperCase()}`;
}

function createBasis(documentId: string, classification: Classification, redactions: Redaction[], version: number): AuthBasis {
  return {
    id: `B-${documentId}-v${version}`,
    documentId,
    classification,
    redactionHash: hashRedactions(redactions),
    version,
    status: '有效',
    createdAt: new Date().toISOString()
  };
}

let auditSeq = 0;
function makeAudit(
  role: Role,
  action: AuditEntry['action'],
  resource: string,
  result: AuditEntry['result'],
  reason?: string
): AuditEntry {
  auditSeq += 1;
  return {
    id: `A-${Date.now()}-${auditSeq}`,
    timestamp: new Date().toISOString(),
    actor: actorName(role),
    role,
    action,
    resource,
    result,
    reason
  };
}

/* ---------- default data ---------- */

const defaultDocuments: DisclosureRecord[] = [
  {
    id: 'DOC-00418',
    title: '设备采购补充协议（第三版）',
    bundle: '北岭项目 · 第一批披露',
    pages: 3,
    classification: '严格机密',
    owner: '林清',
    updatedAt: '09:48',
    status: '去密中',
    issue: '合同主体与商业条款',
    size: '8.4 MB',
    redactions: [
      { id: 'R-01', page: 1, x: 0.12, y: 0.16, width: 0.30, height: 0.04, reason: '商业秘密', privilege: '合同保密', status: 'confirmed' },
      { id: 'R-02', page: 1, x: 0.50, y: 0.43, width: 0.34, height: 0.06, reason: '个人手机号', privilege: '个人信息', status: 'draft' },
      { id: 'R-03', page: 2, x: 0.11, y: 0.25, width: 0.68, height: 0.05, reason: '第三方报价', privilege: '商业敏感', status: 'confirmed' }
    ],
    basisId: 'B-DOC-00418-v1'
  },
  {
    id: 'DOC-00427',
    title: '现场会议纪要 2026-08-19',
    bundle: '北岭项目 · 第一批披露',
    pages: 3,
    classification: '机密',
    owner: '周叙',
    updatedAt: '09:31',
    status: '待质检',
    issue: '事故预防与整改安排',
    size: '3.1 MB',
    redactions: [
      { id: 'R-04', page: 1, x: 0.08, y: 0.69, width: 0.74, height: 0.05, reason: '内部调查意见', privilege: '工作成果', status: 'confirmed' }
    ],
    basisId: 'B-DOC-00427-v1'
  },
  {
    id: 'DOC-00435',
    title: '设备运行数据摘录',
    bundle: '北岭项目 · 第二批披露',
    pages: 3,
    classification: '内部',
    owner: '顾言',
    updatedAt: '08:56',
    status: '可发布',
    issue: '运行记录',
    size: '12.7 MB',
    redactions: [
      { id: 'R-05', page: 2, x: 0.44, y: 0.56, width: 0.26, height: 0.04, reason: '人员姓名', privilege: '个人信息', status: 'confirmed' }
    ],
    basisId: 'B-DOC-00435-v1'
  }
];

const defaultBases: AuthBasis[] = [
  createBasis('DOC-00418', '严格机密', defaultDocuments[0].redactions, 1),
  createBasis('DOC-00427', '机密', defaultDocuments[1].redactions, 1),
  createBasis('DOC-00435', '内部', defaultDocuments[2].redactions, 1)
];

const defaultReviews: ReviewConclusion[] = [
  {
    id: 'RV-01',
    basisId: 'B-DOC-00418-v1',
    documentId: 'DOC-00418',
    reviewer: '林清',
    result: '通过',
    submittedAt: '09:52',
    status: '已接受'
  }
];

const defaultBatches: ReleaseBatch[] = [
  {
    id: 'BATCH-01',
    name: '第一批披露 · 旧批次',
    documentIds: ['DOC-00418', 'DOC-00427'],
    status: '等待',
    hasSnapshot: false,
    exportCheckpoint: 0
  },
  {
    id: 'BATCH-02',
    name: '第二批披露 · 新批次',
    documentIds: ['DOC-00435'],
    status: '等待',
    hasSnapshot: true,
    classificationSnapshot: { 'DOC-00435': '内部' },
    exportCheckpoint: 0
  }
];

type State = {
  documents: DisclosureRecord[];
  activeDocumentId: string;
  activePage: number;
  activeRedactionId: string | null;
  redactionMode: boolean;
  reviewChecks: Record<string, boolean>;
  metadataCleaned: boolean;

  bases: AuthBasis[];
  reviews: ReviewConclusion[];
  adjudication: AdjudicationEntry[];
  auditLog: AuditEntry[];
  batches: ReleaseBatch[];

  currentRole: Role;
  lastDenial: AuditEntry | null;

  selectDocument: (id: string) => void;
  setPage: (page: number) => void;
  toggleRedactionMode: () => void;
  addRedaction: (redaction: Omit<Redaction, 'id' | 'status'>) => void;
  confirmRedaction: (id: string) => void;
  selectRedaction: (id: string) => void;
  updateClassification: (classification: Classification) => void;
  toggleReviewCheck: (id: string) => void;
  toggleMetadata: () => void;
  markReady: () => void;

  setRole: (role: Role) => void;
  submitReview: (documentId: string, result: '通过' | '退回', redactions?: Redaction[], reason?: string) => void;
  exportBatch: (batchId: string) => void;
  retryExport: (batchId: string) => void;
  createBatchSnapshot: (batchId: string) => void;
  clearDenial: () => void;
};

export const useDisclosureStore = create<State>()(
  persist(
    (set, get) => ({
      documents: defaultDocuments,
      activeDocumentId: defaultDocuments[0].id,
      activePage: 1,
      activeRedactionId: 'R-02',
      redactionMode: false,
      reviewChecks: {
        'forbidden-terms': true,
        'page-number': true,
        'image-boundary': false,
        'metadata': false
      },
      metadataCleaned: false,

      bases: defaultBases,
      reviews: defaultReviews,
      adjudication: [],
      auditLog: [
        makeAudit('审核组', '查看', 'DOC-00418', '允许'),
        makeAudit('审核组', '修改', 'DOC-00418', '允许'),
        makeAudit('导出员', '导出', 'DOC-00435', '允许')
      ],
      batches: defaultBatches,

      currentRole: '审核组',
      lastDenial: null,

      selectDocument: (id) => {
        const state = get();
        const doc = state.documents.find((d) => d.id === id);
        if (doc && !can(state.currentRole, '查看', doc.classification)) {
          const entry = makeAudit(state.currentRole, '查看', doc.title, '拒绝', `无权查看 ${doc.classification} 密级文档`);
          set({ auditLog: [entry, ...state.auditLog], lastDenial: entry });
          return;
        }
        set({ activeDocumentId: id, activePage: 1, activeRedactionId: null, redactionMode: false, lastDenial: null });
      },

      setPage: (page) => set({ activePage: page }),

      toggleRedactionMode: () => set((state) => ({ redactionMode: !state.redactionMode })),

      addRedaction: (redaction) => {
        const state = get();
        const doc = state.documents.find((d) => d.id === state.activeDocumentId);
        if (!doc) return;
        if (!can(state.currentRole, '修改', doc.classification)) {
          const entry = makeAudit(state.currentRole, '修改', doc.title, '拒绝', `无权修改 ${doc.classification} 密级文档`);
          set({ auditLog: [entry, ...state.auditLog], lastDenial: entry });
          return;
        }
        const newRedaction = { ...redaction, id: `R-${Date.now()}`, status: 'draft' as const };
        const updatedRedactions = [...doc.redactions, newRedaction];
        // 区域变化 → 依据失效 cascade
        const newBasis = invalidateBasis(state, doc, updatedRedactions, '区域变化');
        set({
          documents: state.documents.map((d) => d.id === doc.id ? { ...d, redactions: updatedRedactions, basisId: newBasis.id } : d),
          bases: [...state.bases.map((b) => b.id === doc.basisId ? { ...b, status: '已失效' as const, invalidatedAt: new Date().toISOString(), invalidatedReason: '区域变化' } : b), newBasis],
          reviews: state.reviews.map((r) => r.basisId === doc.basisId ? { ...r, status: '已失效' as const } : r),
          batches: state.batches.map((b) => b.documentIds.includes(doc.id) && b.status === '导出中' ? { ...b, status: '等待' as const } : b),
          auditLog: [makeAudit(state.currentRole, '区域变更', doc.title, '允许', '去密区域变化，依据已失效'), ...state.auditLog]
        });
      },

      confirmRedaction: (id) => {
        const state = get();
        const doc = state.documents.find((d) => d.id === state.activeDocumentId);
        if (!doc) return;
        if (!can(state.currentRole, '修改', doc.classification)) {
          const entry = makeAudit(state.currentRole, '修改', doc.title, '拒绝', `无权修改 ${doc.classification} 密级文档`);
          set({ auditLog: [entry, ...state.auditLog], lastDenial: entry });
          return;
        }
        const updatedRedactions = doc.redactions.map((r) => r.id === id ? { ...r, status: 'confirmed' as const } : r);
        const newBasis = invalidateBasis(state, doc, updatedRedactions, '区域变化');
        set({
          documents: state.documents.map((d) => d.id === doc.id ? { ...d, redactions: updatedRedactions, basisId: newBasis.id } : d),
          bases: [...state.bases.map((b) => b.id === doc.basisId ? { ...b, status: '已失效' as const, invalidatedAt: new Date().toISOString(), invalidatedReason: '区域变化' } : b), newBasis],
          reviews: state.reviews.map((r) => r.basisId === doc.basisId ? { ...r, status: '已失效' as const } : r),
          batches: state.batches.map((b) => b.documentIds.includes(doc.id) && b.status === '导出中' ? { ...b, status: '等待' as const } : b),
          auditLog: [makeAudit(state.currentRole, '区域变更', doc.title, '允许', '去密区域确认，依据已失效'), ...state.auditLog]
        });
      },

      selectRedaction: (id) => set({ activeRedactionId: id }),

      updateClassification: (classification) => {
        const state = get();
        const doc = state.documents.find((d) => d.id === state.activeDocumentId);
        if (!doc) return;
        if (!can(state.currentRole, '修改', doc.classification)) {
          const entry = makeAudit(state.currentRole, '修改', doc.title, '拒绝', `无权修改 ${doc.classification} 密级文档`);
          set({ auditLog: [entry, ...state.auditLog], lastDenial: entry });
          return;
        }
        const newBasis = invalidateBasis(state, doc, doc.redactions, '密级变化');
        set({
          documents: state.documents.map((d) => d.id === doc.id ? { ...d, classification, basisId: newBasis.id } : d),
          bases: [...state.bases.map((b) => b.id === doc.basisId ? { ...b, status: '已失效' as const, invalidatedAt: new Date().toISOString(), invalidatedReason: '密级变化' } : b), newBasis],
          reviews: state.reviews.map((r) => r.basisId === doc.basisId ? { ...r, status: '已失效' as const } : r),
          batches: state.batches.map((b) => b.documentIds.includes(doc.id) && b.status === '导出中' ? { ...b, status: '等待' as const } : b),
          auditLog: [makeAudit(state.currentRole, '密级变更', doc.title, '允许', `密级变更为 ${classification}，依据已失效`), ...state.auditLog]
        });
      },

      toggleReviewCheck: (id) => set((state) => ({ reviewChecks: { ...state.reviewChecks, [id]: !state.reviewChecks[id] } })),
      toggleMetadata: () => set((state) => ({ metadataCleaned: !state.metadataCleaned })),
      markReady: () => set((state) => ({
        documents: state.documents.map((doc) => doc.id === state.activeDocumentId ? { ...doc, status: '可发布' } : doc)
      })),

      setRole: (role) => set({ currentRole: role, lastDenial: null }),

      submitReview: (documentId, result, redactions, reason) => {
        const state = get();
        const doc = state.documents.find((d) => d.id === documentId);
        if (!doc) return;
        const basis = state.bases.find((b) => b.id === doc.basisId && b.status === '有效');
        if (!basis) return;

        // 权限检查
        if (!can(state.currentRole, '查看', doc.classification)) {
          const entry = makeAudit(state.currentRole, '提交复核', doc.title, '拒绝', `无权查看 ${doc.classification} 密级文档`);
          set({ auditLog: [entry, ...state.auditLog], lastDenial: entry });
          return;
        }

        // 检查是否已有已接受的复核（占用依据）
        const acceptedReview = state.reviews.find((r) => r.basisId === basis.id && r.status === '已接受');
        if (acceptedReview) {
          // 后到者进入待裁决账，不能覆盖已接受内容
          const adjudicationEntry: AdjudicationEntry = {
            id: `ADJ-${Date.now()}`,
            documentId,
            basisId: basis.id,
            reviewer: actorName(state.currentRole),
            redactions: redactions ?? [],
            reason: reason ?? '',
            submittedAt: new Date().toISOString(),
            status: '待裁决'
          };
          const reviewEntry: ReviewConclusion = {
            id: `RV-${Date.now()}`,
            basisId: basis.id,
            documentId,
            reviewer: actorName(state.currentRole),
            result,
            submittedAt: new Date().toISOString(),
            status: '待裁决',
            pendingRedactions: redactions,
            pendingReason: reason
          };
          set({
            adjudication: [adjudicationEntry, ...state.adjudication],
            reviews: [reviewEntry, ...state.reviews],
            auditLog: [makeAudit(state.currentRole, '提交复核', doc.title, '允许', '依据已被占用，进入待裁决账'), ...state.auditLog]
          });
          return;
        }

        // 首个提交者占用依据
        const reviewEntry: ReviewConclusion = {
          id: `RV-${Date.now()}`,
          basisId: basis.id,
          documentId,
          reviewer: actorName(state.currentRole),
          result,
          submittedAt: new Date().toISOString(),
          status: '已接受'
        };
        set({
          reviews: [reviewEntry, ...state.reviews],
          auditLog: [makeAudit(state.currentRole, '提交复核', doc.title, '允许', '已占用依据，复核已接受'), ...state.auditLog]
        });
      },

      exportBatch: (batchId) => {
        const state = get();
        const batch = state.batches.find((b) => b.id === batchId);
        if (!batch) return;

        // 旧批次缺少密级快照 → 先隔离待复核
        if (!batch.hasSnapshot) {
          const entry = makeAudit(state.currentRole, '导出', batch.name, '拒绝', '批次缺少密级快照，已隔离待复核');
          set({
            batches: state.batches.map((b) => b.id === batchId ? { ...b, status: '已隔离' } : b),
            auditLog: [entry, ...state.auditLog],
            lastDenial: entry
          });
          return;
        }

        // 去重文档 ID，防止同一文档在批次里重复
        const uniqueDocIds = [...new Set(batch.documentIds)];
        let checkpoint = batch.exportCheckpoint;

        // 快照核对：密级与快照不符 → 重新隔离，不能按今天的密级放行
        for (const docId of uniqueDocIds) {
          const doc = state.documents.find((d) => d.id === docId);
          if (!doc) continue;
          const snapClassification = batch.classificationSnapshot?.[docId];
          if (snapClassification && snapClassification !== doc.classification) {
            const entry = makeAudit(state.currentRole, '导出', batch.name, '拒绝', `${doc.title} 密级已变更（快照 ${snapClassification} → 当前 ${doc.classification}），需重新复核`);
            set({
              batches: state.batches.map((b) => b.id === batchId ? { ...b, status: '已隔离' } : b),
              auditLog: [entry, ...state.auditLog],
              lastDenial: entry
            });
            return;
          }
        }

        for (let i = checkpoint; i < uniqueDocIds.length; i++) {
          const docId = uniqueDocIds[i];
          const doc = state.documents.find((d) => d.id === docId);
          if (!doc) continue;

          // 检查是否有针对当前依据的有效复核
          const basis = state.bases.find((b) => b.documentId === docId && b.status === '有效');
          const hasValidReview = state.reviews.some(
            (r) => r.documentId === docId && r.basisId === basis?.id && r.status === '已接受'
          );
          if (!hasValidReview) {
            const entry = makeAudit(state.currentRole, '导出', batch.name, '拒绝', `${doc.title} 缺少有效复核结论，需重新复核`);
            set({
              batches: state.batches.map((b) => b.id === batchId ? { ...b, status: '等待', exportCheckpoint: i } : b),
              auditLog: [entry, ...state.auditLog],
              lastDenial: entry
            });
            return;
          }

          // 检查导出权限
          if (!can(state.currentRole, '导出', doc.classification)) {
            const entry = makeAudit(state.currentRole, '导出', batch.name, '拒绝', `无权导出 ${doc.classification} 密级文档 ${doc.title}`);
            set({
              batches: state.batches.map((b) => b.id === batchId ? { ...b, status: '等待', exportCheckpoint: i } : b),
              auditLog: [entry, ...state.auditLog],
              lastDenial: entry
            });
            return;
          }

          checkpoint = i + 1;
        }

        // 全部导出成功
        const entry = makeAudit(state.currentRole, '导出', batch.name, '允许', `成功导出 ${uniqueDocIds.length} 份文档`);
        set({
          batches: state.batches.map((b) => b.id === batchId ? { ...b, status: '已导出', exportCheckpoint: checkpoint, exportedAt: new Date().toISOString() } : b),
          auditLog: [entry, ...state.auditLog]
        });
      },

      retryExport: (batchId) => {
        const state = get();
        const batch = state.batches.find((b) => b.id === batchId);
        if (!batch) return;
        set({
          batches: state.batches.map((b) => b.id === batchId ? { ...b, status: '导出中' } : b),
          auditLog: [makeAudit(state.currentRole, '导出重试', batch.name, '允许', `从检查点 ${batch.exportCheckpoint} 重试`), ...state.auditLog]
        });
        // 重新执行导出逻辑
        get().exportBatch(batchId);
      },

      createBatchSnapshot: (batchId) => {
        const state = get();
        const batch = state.batches.find((b) => b.id === batchId);
        if (!batch) return;
        const snapshot: Record<string, Classification> = {};
        batch.documentIds.forEach((docId) => {
          const doc = state.documents.find((d) => d.id === docId);
          if (doc) snapshot[docId] = doc.classification;
        });
        set({
          batches: state.batches.map((b) => b.id === batchId ? { ...b, hasSnapshot: true, classificationSnapshot: snapshot, status: '等待' } : b),
          auditLog: [makeAudit(state.currentRole, '批次隔离', batch.name, '允许', '已创建密级快照，解除隔离'), ...state.auditLog]
        });
      },

      clearDenial: () => set({ lastDenial: null })
    }),
    { name: 'yy59-disclosure-draft' }
  )
);

/** 依据失效：创建新依据，旧依据标记失效 */
function invalidateBasis(state: State, doc: DisclosureRecord, updatedRedactions: Redaction[], reason: string): AuthBasis {
  const currentBasis = state.bases.find((b) => b.id === doc.basisId);
  const newVersion = (currentBasis?.version ?? 0) + 1;
  return createBasis(doc.id, doc.classification, updatedRedactions, newVersion);
}
