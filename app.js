/**
 * Main Application Controller
 * Đánh giá, xếp loại chất lượng tổ chức đảng và đảng viên năm 2026
 * Đảng bộ xã Mường Lầm, tỉnh Sơn La
 */
(function (global) {
  'use strict';

  const Data = global.AppData;
  const Store = global.AppStore;

  const LOGO_PRIMARY = 'logo.png';
  const LOGO_FALLBACK = 'file:///C:/Users/Administrator/.gemini/antigravity/brain/e4b8eb64-5fb8-45ca-b392-ca5c20c5d0a8/.user_uploaded/media_1795551884851_a6fb4870.png';

  function renderLogoImg(cssClass) {
    return '<img src="' + LOGO_PRIMARY + '" ' +
      'onerror="if(!this.dataset.fb){this.dataset.fb=\'1\';this.src=\'' + LOGO_FALLBACK + '\';}" ' +
      'alt="Logo Đảng bộ xã Mường Lầm" class="' + escHtml(cssClass) + '" />';
  }

  const ui = {
    mode: 'voter', // 'voter' | 'admin'
    adminUnlocked: false,
    adminTab: 'progress', // 'progress' | 'mau07' | 'mau3a1' | 'mau3a2' | 'mau3a3' | 'mau3a4' | 'config'
    adminBranchId: 'phen-sang',

    // Voter 5-step state
    step: 1, // 1..5, 6 = success receipt
    branchId: 'phen-sang',
    voterId: '',
    voterRole: 'DANG_VIEN',
    comboOpen: false,
    comboQuery: '',
    selfRating: 'HTTNV',
    committeeRating: 'HTTNV',
    branchRating: 'HTTNV',
    round1Votes: {}, // memberId -> 'HTTNV' | 'HTNV' | 'KHTNV'
    round2Htxsnv: new Set(), // Set of memberIds elected HTXSNV
    step4Round: 1, // 1 | 2
    step4Query: '',
    lastReceipt: null,

    // QR modal state
    qrBranchFilter: 'phen-sang',
    qrBaseUrl: '',
    supportMenuOpen: false
  };

  let toastTimer = null;

  function showToast(msg, duration) {
    const el = document.getElementById('toastRoot');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.add('hidden');
    }, duration || 3200);
  }

  function escHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatTime(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) +
        ' ' + d.toLocaleDateString('vi-VN');
    } catch (e) {
      return iso;
    }
  }

  function initRound1DefaultsForBranch(branchId) {
    const members = Store.getBranchMembers(branchId);
    const next = {};
    members.forEach(function (m) {
      next[m.id] = 'HTTNV';
    });
    ui.round1Votes = next;
    ui.round2Htxsnv = new Set();
    ui.step4Round = 1;
    ui.step4Query = '';
  }

  function getMaxHtxsnvForRound2() {
    const members = Store.getBranchMembers(ui.branchId);
    const httnvMembers = members.filter(function (m) {
      return (ui.round1Votes[m.id] || 'HTTNV') === 'HTTNV';
    });
    return {
      httnvMembers: httnvMembers,
      httnvCount: httnvMembers.length,
      maxAllowed: Math.floor(httnvMembers.length * 0.2)
    };
  }

  function reconcileRound2WithRound1() {
    const info = getMaxHtxsnvForRound2();
    const eligibleSet = new Set(info.httnvMembers.map(function (m) { return m.id; }));
    const kept = [];
    ui.round2Htxsnv.forEach(function (id) {
      if (eligibleSet.has(id)) kept.push(id);
    });
    if (kept.length > info.maxAllowed) {
      kept.length = info.maxAllowed;
      showToast('Đã tự động điều chỉnh danh sách HTXSNV theo trần tối đa 20% mới (' + info.maxAllowed + ' đ/c).');
    }
    ui.round2Htxsnv = new Set(kept);
  }

  function resetVoterWizard(keepBranch) {
    ui.step = 1;
    if (!keepBranch) ui.branchId = 'phen-sang';
    ui.voterId = '';
    ui.voterRole = 'DANG_VIEN';
    ui.comboOpen = false;
    ui.comboQuery = '';
    ui.selfRating = 'HTTNV';
    ui.committeeRating = 'HTTNV';
    ui.branchRating = 'HTTNV';
    ui.lastReceipt = null;
    initRound1DefaultsForBranch(ui.branchId);
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ===== RENDER HELPERS =====

  function renderHeaderControls() {
    const btn = document.getElementById('btnToggleMode');
    const icon = document.getElementById('modeBtnIcon');
    const label = document.getElementById('modeBtnLabel');
    if (!btn) return;
    if (ui.mode === 'admin') {
      btn.classList.add('active');
      icon.textContent = '🗳️';
      label.textContent = 'Về màn hình Bỏ phiếu';
    } else {
      btn.classList.remove('active');
      icon.textContent = '⚙️';
      label.textContent = 'Quản trị & Kiểm phiếu';
    }

    const syncPillText = document.getElementById('syncStatusText');
    if (syncPillText) {
      const st = Store.getState();
      const totalBallots = Object.keys(st.ballots || {}).length;
      syncPillText.textContent = (st.syncUrl ? 'Cloud + Local' : 'Đồng bộ tức thì') + ' (' + totalBallots + ' phiếu)';
    }
  }

  function renderStepper() {
    const steps = [
      { num: 1, title: 'Định danh' },
      { num: 2, title: 'Tự nhận' },
      { num: 3, title: 'Tập thể' },
      { num: 4, title: 'Đảng viên' },
      { num: 5, title: 'Xác nhận' }
    ];
    return (
      '<div class="stepper no-print">' +
      steps.map(function (s) {
        let cls = 'step-item';
        if (ui.step === s.num) cls += ' active';
        else if (ui.step > s.num) cls += ' done';
        const badge = ui.step > s.num ? '✓' : s.num;
        return '<div class="' + cls + '"><div class="step-num">' + badge + '</div><div>' + s.title + '</div></div>';
      }).join('') +
      '</div>'
    );
  }

  function renderComboOptionsHtml(members) {
    const q = Data.normalizeVietnamese(ui.comboQuery);
    const filteredMembers = members.filter(function (m) {
      if (!q) return true;
      return Data.normalizeVietnamese(m.displayName).includes(q) ||
        Data.normalizeVietnamese(m.roleMeta.label).includes(q);
    });
    if (filteredMembers.length === 0) {
      return '<div style="padding:14px;text-align:center;color:#6b7280;">Không tìm thấy đảng viên phù hợp.</div>';
    }
    return filteredMembers.map(function (m) {
      const voted = Store.hasVoted(m.id);
      const isSel = m.id === ui.voterId;
      let cls = 'combobox-option';
      if (isSel) cls += ' selected';
      if (voted) cls += ' voted';
      return '<div class="' + cls + '" data-action="pick-member" data-member-id="' + escHtml(m.id) + '">' +
        '<span>' + escHtml(m.displayName) + '</span>' +
        '<span style="display:flex;gap:4px;align-items:center;">' +
        (m.role !== 'DANG_VIEN' ? '<span class="badge badge-role">' + escHtml(m.roleMeta.label) + '</span>' : '') +
        (voted ? '<span class="badge badge-voted">✓ Đã nộp</span>' : '') +
        '</span>' +
        '</div>';
    }).join('');
  }

  function renderStep1() {
    const members = Store.getBranchMembers(ui.branchId);
    const selectedMember = members.find(function (m) { return m.id === ui.voterId; }) || null;
    const alreadyVoted = selectedMember ? Store.hasVoted(selectedMember.id) : false;
    const existingBallot = selectedMember ? Store.getBallot(selectedMember.id) : null;

    const branch1 = Data.getBranchById('na-tau');
    const branch2 = Data.getBranchById('phen-sang');
    const rep1 = Store.computeBranchReport('na-tau');
    const rep2 = Store.computeBranchReport('phen-sang');

    let html = '<div class="card">';
    html += '<div class="login-logo-box">' +
      renderLogoImg('login-logo') +
      '<div style="font-size:12px;font-weight:700;color:#b45309;letter-spacing:0.04em;">ĐẢNG BỘ XÃ MƯỜNG LẦM • TỈNH SƠN LA</div>' +
      '<h2 class="card-title" style="justify-content:center;margin-top:4px;">Bước 1: Đăng nhập &amp; Định danh đảng viên</h2>' +
      '<p class="card-subtitle">Chọn Chi bộ và họ tên của đồng chí để bắt đầu bỏ phiếu đánh giá năm 2026.</p>' +
      '</div>';

    // Chọn Chi bộ
    html += '<div class="field-group">' +
      '<label class="field-label">1. Chọn Chi bộ trực thuộc <span class="required-mark">*</span></label>' +
      '<div class="branch-grid">' +
      '<button type="button" class="branch-card ' + (ui.branchId === 'na-tau' ? 'selected' : '') + '" data-action="select-branch" data-branch="na-tau">' +
      '<div class="branch-name">' + escHtml(branch1.name) + '</div>' +
      '<div class="branch-meta">' + branch1.members.length + ' đảng viên • Đã nộp: <strong>' + rep1.votedCount + '/' + rep1.totalMembers + '</strong></div>' +
      '</button>' +
      '<button type="button" class="branch-card ' + (ui.branchId === 'phen-sang' ? 'selected' : '') + '" data-action="select-branch" data-branch="phen-sang">' +
      '<div class="branch-name">' + escHtml(branch2.name) + '</div>' +
      '<div class="branch-meta">' + branch2.members.length + ' đảng viên • Đã nộp: <strong>' + rep2.votedCount + '/' + rep2.totalMembers + '</strong></div>' +
      '</button>' +
      '</div></div>';

    // Chọn Họ tên (Dropdown có tìm kiếm)
    html += '<div class="field-group">' +
      '<label class="field-label">2. Chọn Họ và tên đảng viên <span class="required-mark">*</span></label>' +
      '<div class="combobox-wrap" id="memberCombobox">' +
      '<button type="button" class="combobox-trigger ' + (ui.comboOpen ? 'open' : '') + '" data-action="toggle-combo">' +
      '<span>' + (selectedMember ? escHtml(selectedMember.displayName) : '-- Chạm để tìm và chọn họ tên --') + '</span>' +
      '<span style="color:#991b1b;font-weight:800;">' + (ui.comboOpen ? '▲' : '▼') + '</span>' +
      '</button>';

    if (ui.comboOpen) {
      html += '<div class="combobox-panel">' +
        '<div class="combobox-search-box">' +
        '<input type="text" id="comboSearchInput" class="input-control" placeholder="Nhập tên hoặc STT (vd: Hoa, 13, 28, Trực)..." value="' + escHtml(ui.comboQuery) + '" autocomplete="off" />' +
        '</div>' +
        '<div class="combobox-list" id="comboListBody">' +
        renderComboOptionsHtml(members) +
        '</div></div>';
    }
    html += '</div>';
    if (ui.branchId === 'phen-sang') {
      html += '<div style="font-size:12px;color:#6b7280;margin-top:5px;">Lưu ý: Chi bộ có 2 đồng chí tên Quàng Văn Hoa được phân biệt rõ theo STT &amp; năm sinh: <strong>13. Quàng Văn Hoa - 1980</strong> và <strong>28. Quàng Văn Hoa - 1970</strong>.</div>';
    }
    html += '</div>';

    // Chọn Đối tượng / Chức vụ Đảng
    if (selectedMember) {
      const configuredRole = Store.getMemberRole(selectedMember.id);
      html += '<div class="field-group">' +
        '<label class="field-label">3. Đối tượng / Chức vụ Đảng <span class="required-mark">*</span></label>' +
        '<div class="role-grid">' +
        Data.ROLES.map(function (r) {
          let cls = 'role-btn';
          if (ui.voterRole === r.code) cls += ' selected';
          if (configuredRole === r.code && r.code !== 'DANG_VIEN') cls += ' suggested';
          return '<button type="button" class="' + cls + '" data-action="select-role" data-role="' + r.code + '">' + escHtml(r.label) + '</button>';
        }).join('') +
        '</div>' +
        '<div style="font-size:12.5px;color:#6b7280;margin-top:6px;">' +
        (Store.isCommitteeRole(ui.voterRole)
          ? 'Với vai trò <strong>' + escHtml(Data.getRoleMeta(ui.voterRole).label) + '</strong>, ở Bước 3 đồng chí sẽ thực hiện thêm phần biểu quyết đánh giá tập thể Ban Chi ủy.'
          : 'Với vai trò <strong>Đảng viên</strong>, ở Bước 3 hệ thống sẽ ẩn phần đánh giá Ban Chi ủy và chỉ hiển thị đánh giá tập thể Chi bộ.') +
        '</div></div>';

      if (alreadyVoted && existingBallot) {
        html += '<div class="alert alert-danger">' +
          '<span style="font-size:18px;">⛔</span>' +
          '<div>Đồng chí <strong>' + escHtml(selectedMember.displayName) + '</strong> đã nộp phiếu biểu quyết (Mã biên nhận: <strong>' + escHtml(existingBallot.id) + '</strong> lúc ' + escHtml(formatTime(existingBallot.submittedAt)) + ').<br/>' +
          'Mỗi đảng viên chỉ được gửi phiếu 1 lần. Nếu có nhầm lẫn cần bỏ lại, vui lòng đề nghị Thư ký mở khóa trong trang <strong>Quản trị &amp; Kiểm phiếu</strong>.</div>' +
          '</div>';
      }
    }

    html += renderStep1SupportCard();
    html += '</div>';
    return html;
  }

  function renderStep1SupportCard() {
    const s = Data.SUPPORT_INFO;
    return (
      '<div class="support-info-card">' +
      '<div class="support-info-title">📋 Đoàn công tác chỉ đạo &amp; Hỗ trợ trực tiếp</div>' +
      '<div>Phụ trách hướng dẫn &amp; hỗ trợ kỹ thuật (<strong>Đoàn công tác số 07 - QĐ 417-QĐ/ĐU</strong>): Đồng chí <strong>' + escHtml(s.officerName) + '</strong> - ' + escHtml(s.teamRole) + ' | ĐT/Zalo: <strong>' + escHtml(s.phoneDisplay) + '</strong></div>' +
      '<div style="font-size:12px;color:#6b7280;margin-top:3px;">' + escHtml(s.officerTitle) + ' (' + escHtml(s.scopeNote) + ').</div>' +
      '<div class="support-actions-row">' +
      '<a href="tel:' + escHtml(s.phoneTel) + '" class="support-action-link support-action-call">📞 Gọi trực tiếp: ' + escHtml(s.phoneDisplay) + '</a>' +
      '<a href="' + escHtml(s.zaloUrl) + '" target="_blank" rel="noopener noreferrer" class="support-action-link support-action-zalo">💬 Mở nhanh Zalo</a>' +
      '</div>' +
      '</div>'
    );
  }

  function renderStep2() {
    const members = Store.getBranchMembers(ui.branchId);
    const voter = members.find(function (m) { return m.id === ui.voterId; });

    let html = '<div class="card">';
    html += '<div class="card-header"><div>' +
      '<h2 class="card-title">Bước 2: Cá nhân tự nhận mức xếp loại năm 2026</h2>' +
      '<p class="card-subtitle">Đảng viên: <strong>' + escHtml(voter ? voter.displayName : '') + '</strong> — Chức vụ: <strong>' + escHtml(Data.getRoleMeta(ui.voterRole).label) + '</strong></p>' +
      '</div></div>';

    html += '<div class="rating-options">';
    Data.RATINGS.forEach(function (r) {
      const sel = ui.selfRating === r.code;
      html += '<button type="button" class="rating-card ' + (sel ? 'selected' : '') + '" data-action="set-self-rating" data-rating="' + r.code + '">' +
        '<div>' +
        '<div class="rating-card-title">' + r.order + '. ' + escHtml(r.label) + '</div>' +
        '</div>' +
        '<div class="rating-radio"></div>' +
        '</button>';
    });
    html += '</div></div>';
    return html;
  }

  function renderStep3() {
    const branch = Data.getBranchById(ui.branchId);
    const isComm = Store.isCommitteeRole(ui.voterRole);

    let html = '';

    // CHỈ hiển thị Ban Chi ủy nếu là Bí thư, Phó Bí thư hoặc Chi ủy viên
    if (isComm) {
      html += '<div class="card">';
      html += '<div class="card-header"><div>' +
        '<h2 class="card-title">Bước 3A: Biểu quyết xếp loại tập thể Ban Chi ủy</h2>' +
        '<p class="card-subtitle">Dành riêng cho các đồng chí trong Ban Chi ủy (' + escHtml(branch.name) + ').</p>' +
        '</div><span class="badge badge-role">' + escHtml(Data.getRoleMeta(ui.voterRole).label) + '</span></div>';
      html += '<div class="rating-options">';
      Data.RATINGS.forEach(function (r) {
        const sel = ui.committeeRating === r.code;
        html += '<button type="button" class="rating-card ' + (sel ? 'selected' : '') + '" data-action="set-committee-rating" data-rating="' + r.code + '">' +
          '<div class="rating-card-title">' + r.order + '. ' + escHtml(r.label) + '</div>' +
          '<div class="rating-radio"></div>' +
          '</button>';
      });
      html += '</div></div>';
    }

    // Hiển thị cho TẤT CẢ đảng viên: Đánh giá tập thể Chi bộ
    html += '<div class="card">';
    html += '<div class="card-header"><div>' +
      '<h2 class="card-title">Bước 3' + (isComm ? 'B' : '') + ': Biểu quyết xếp loại tập thể ' + escHtml(branch.name) + '</h2>' +
      '<p class="card-subtitle">Toàn thể đảng viên trong chi bộ cùng biểu quyết mức xếp loại chất lượng Chi bộ năm 2026.</p>' +
      '</div></div>';
    html += '<div class="rating-options">';
    Data.RATINGS.forEach(function (r) {
      const sel = ui.branchRating === r.code;
      html += '<button type="button" class="rating-card ' + (sel ? 'selected' : '') + '" data-action="set-branch-rating" data-rating="' + r.code + '">' +
        '<div class="rating-card-title">' + r.order + '. ' + escHtml(r.label) + '</div>' +
        '<div class="rating-radio"></div>' +
        '</button>';
    });
    html += '</div></div>';

    return html;
  }

  function renderStep4BodyHtml() {
    const members = Store.getBranchMembers(ui.branchId);
    const q = Data.normalizeVietnamese(ui.step4Query);

    let countHTTNV = 0;
    let countHTNV = 0;
    let countKHTNV = 0;
    members.forEach(function (m) {
      const v = ui.round1Votes[m.id] || 'HTTNV';
      if (v === 'HTTNV') countHTTNV++;
      else if (v === 'HTNV') countHTNV++;
      else if (v === 'KHTNV') countKHTNV++;
    });

    const r2Info = getMaxHtxsnvForRound2();
    const selectedCount = ui.round2Htxsnv.size;
    const atLimit = selectedCount >= r2Info.maxAllowed;
    let html = '';

    if (ui.step4Round === 1) {
      html += '<div class="alert alert-info" style="justify-content:space-between;flex-wrap:wrap;">' +
        '<span>Mặc định chọn sẵn <strong>Hoàn thành tốt nhiệm vụ</strong>. Chạm để điều chỉnh nếu cần.</span>' +
        '<span>HTTNV: <strong>' + countHTTNV + '</strong> • HTNV: <strong>' + countHTNV + '</strong> • KHTNV: <strong>' + countKHTNV + '</strong></span>' +
        '</div>';

      const list = members.filter(function (m) {
        return !q || Data.normalizeVietnamese(m.displayName).includes(q);
      });

      html += '<div class="member-vote-list">';
      list.forEach(function (m) {
        const val = ui.round1Votes[m.id] || 'HTTNV';
        const isSelf = m.id === ui.voterId;
        const existingBallot = Store.getBallot(m.id);
        const selfRatedCode = isSelf ? ui.selfRating : (existingBallot ? existingBallot.selfRating : null);
        const selfRatedMeta = selfRatedCode ? Data.getRatingMeta(selfRatedCode) : null;

        html += '<div class="member-vote-row ' + (isSelf ? 'is-self' : '') + '">' +
          '<div class="member-row-head">' +
          '<div class="member-row-name">' + escHtml(m.displayName) + '</div>' +
          '<div class="member-row-badges">' +
          (isSelf ? '<span class="badge badge-self">Bản thân</span>' : '') +
          (m.role !== 'DANG_VIEN' ? '<span class="badge badge-role">' + escHtml(m.roleMeta.label) + '</span>' : '') +
          (selfRatedMeta ? '<span class="badge ' + selfRatedMeta.badgeClass + '">Tự nhận: ' + selfRatedMeta.shortLabel + '</span>' : '<span class="badge" style="background:#f3f4f6;color:#6b7280;">Chưa tự nhận</span>') +
          '</div></div>' +
          '<div class="seg-3">' +
          '<button type="button" class="seg-btn ' + (val === 'HTTNV' ? 'active-httnv' : '') + '" data-action="set-r1" data-member-id="' + escHtml(m.id) + '" data-rating="HTTNV">Hoàn thành tốt</button>' +
          '<button type="button" class="seg-btn ' + (val === 'HTNV' ? 'active-htnv' : '') + '" data-action="set-r1" data-member-id="' + escHtml(m.id) + '" data-rating="HTNV">Hoàn thành NV</button>' +
          '<button type="button" class="seg-btn ' + (val === 'KHTNV' ? 'active-khtnv' : '') + '" data-action="set-r1" data-member-id="' + escHtml(m.id) + '" data-rating="KHTNV">Không HTNV</button>' +
          '</div>' +
          '</div>';
      });
      html += '</div>';

      html += '<div style="margin-top:16px;text-align:right;">' +
        '<button type="button" class="btn btn-gold" data-action="switch-step4-round" data-round="2" style="width:100%;">Sang Vòng 2: Bầu chọn "Hoàn thành xuất sắc nhiệm vụ" (tối đa ' + r2Info.maxAllowed + ' đ/c) →</button>' +
        '</div>';
    } else {
      const pctBar = r2Info.maxAllowed > 0 ? Math.min(100, Math.round((selectedCount / r2Info.maxAllowed) * 100)) : 0;

      html += '<div class="sticky-quota-bar ' + (atLimit ? 'at-limit' : '') + '">' +
        '<div class="quota-top">' +
        '<span>Bầu "Hoàn thành xuất sắc nhiệm vụ"</span>' +
        '<span>Đã chọn: <strong>' + selectedCount + ' / ' + r2Info.maxAllowed + '</strong> đồng chí (≤ 20%)</span>' +
        '</div>' +
        '<div style="font-size:12px;margin-top:4px;opacity:0.9;">Lọc từ <strong>' + r2Info.httnvCount + '</strong> đồng chí đạt HTTNV ở Vòng 1 (20% làm tròn xuống = tối đa <strong>' + r2Info.maxAllowed + '</strong> người).</div>' +
        '<div class="progress-track"><div class="progress-fill" style="width:' + pctBar + '%"></div></div>' +
        '</div>';

      if (atLimit && r2Info.maxAllowed > 0) {
        html += '<div class="alert alert-danger" id="limitAlertBanner">' +
          '<span>⚠️</span>' +
          '<div><strong>Đã đạt giới hạn tối đa 20% số đảng viên Hoàn thành tốt nhiệm vụ</strong> (' + selectedCount + '/' + r2Info.maxAllowed + ' đồng chí). Hệ thống đã khóa tích thêm; bỏ chọn một đồng chí nếu muốn thay đổi.</div>' +
          '</div>';
      }

      const filteredR2 = r2Info.httnvMembers.filter(function (m) {
        return !q || Data.normalizeVietnamese(m.displayName).includes(q);
      });

      if (filteredR2.length === 0) {
        html += '<div class="alert alert-warning">Không có đảng viên nào đủ điều kiện (đạt Hoàn thành tốt nhiệm vụ ở Vòng 1) khớp bộ lọc.</div>';
      } else {
        html += '<div class="member-vote-list">';
        filteredR2.forEach(function (m) {
          const checked = ui.round2Htxsnv.has(m.id);
          const locked = !checked && atLimit;
          const isSelf = m.id === ui.voterId;
          const existingBallot = Store.getBallot(m.id);
          const selfRatedCode = isSelf ? ui.selfRating : (existingBallot ? existingBallot.selfRating : null);
          const selfRatedMeta = selfRatedCode ? Data.getRatingMeta(selfRatedCode) : null;

          let rowCls = 'member-vote-row';
          if (checked) rowCls += ' checked-htxsnv';
          else if (locked) rowCls += ' locked-row';

          html += '<div class="' + rowCls + '" data-action="toggle-r2" data-member-id="' + escHtml(m.id) + '" data-locked="' + (locked ? '1' : '0') + '">' +
            '<div class="htxsnv-pick-row">' +
            '<div style="min-width:0;">' +
            '<div class="member-row-name">' + escHtml(m.displayName) + '</div>' +
            '<div class="member-row-badges" style="margin-top:4px;">' +
            (isSelf ? '<span class="badge badge-self">Bản thân</span>' : '') +
            (m.role !== 'DANG_VIEN' ? '<span class="badge badge-role">' + escHtml(m.roleMeta.label) + '</span>' : '') +
            (selfRatedMeta ? '<span class="badge ' + selfRatedMeta.badgeClass + '">Tự nhận: ' + selfRatedMeta.shortLabel + '</span>' : '') +
            '</div></div>' +
            '<div class="check-box-ui" aria-checked="' + (checked ? 'true' : 'false') + '">' + (checked ? '✓' : '') + '</div>' +
            '</div></div>';
        });
        html += '</div>';
      }
    }
    return html;
  }

  function renderStep4() {
    const members = Store.getBranchMembers(ui.branchId);
    const branch = Data.getBranchById(ui.branchId);
    const r2Info = getMaxHtxsnvForRound2();
    const selectedCount = ui.round2Htxsnv.size;

    let html = '<div class="card">';
    html += '<div class="card-header"><div>' +
      '<h2 class="card-title">Bước 4: Biểu quyết xếp loại từng đảng viên (' + escHtml(branch.shortName) + ')</h2>' +
      '<p class="card-subtitle">Quy trình 2 vòng: Vòng 1 đánh giá mức độ hoàn thành nhiệm vụ; Vòng 2 bầu chọn tối đa 20% Hoàn thành xuất sắc nhiệm vụ.</p>' +
      '</div></div>';

    html += '<div class="round-tabs">' +
      '<button type="button" class="round-tab ' + (ui.step4Round === 1 ? 'active' : '') + '" data-action="switch-step4-round" data-round="1">Vòng 1: Đánh giá chung (' + members.length + ' đ/c)</button>' +
      '<button type="button" class="round-tab ' + (ui.step4Round === 2 ? 'active' : '') + '" data-action="switch-step4-round" data-round="2">Vòng 2: Bầu HTXSNV (' + selectedCount + '/' + r2Info.maxAllowed + ')</button>' +
      '</div>';

    html += '<div class="field-group" style="margin-bottom:12px;">' +
      '<input type="text" id="step4SearchInput" class="input-control" placeholder="Tìm nhanh đảng viên theo tên hoặc STT..." value="' + escHtml(ui.step4Query) + '" />' +
      '</div>';

    html += '<div id="step4BodyContainer">' + renderStep4BodyHtml() + '</div>';
    html += '</div>';
    return html;
  }

  function renderStep5() {
    const branch = Data.getBranchById(ui.branchId);
    const members = Store.getBranchMembers(ui.branchId);
    const voter = members.find(function (m) { return m.id === ui.voterId; });
    const isComm = Store.isCommitteeRole(ui.voterRole);

    const htxsnvList = [];
    const httnvList = [];
    const htnvList = [];
    const khtnvList = [];

    members.forEach(function (m) {
      if (ui.round2Htxsnv.has(m.id) && (ui.round1Votes[m.id] || 'HTTNV') === 'HTTNV') {
        htxsnvList.push(m);
      } else {
        const v = ui.round1Votes[m.id] || 'HTTNV';
        if (v === 'HTTNV') httnvList.push(m);
        else if (v === 'HTNV') htnvList.push(m);
        else if (v === 'KHTNV') khtnvList.push(m);
      }
    });

    const r2Info = getMaxHtxsnvForRound2();
    const selfMeta = Data.getRatingMeta(ui.selfRating);
    const commMeta = Data.getRatingMeta(ui.committeeRating);
    const branchMeta = Data.getRatingMeta(ui.branchRating);

    let html = '<div class="card">';
    html += '<div class="card-header"><div>' +
      '<h2 class="card-title">Bước 5: Xác nhận &amp; Nộp phiếu biểu quyết</h2>' +
      '<p class="card-subtitle">Vui lòng kiểm tra kỹ toàn bộ nội dung trước khi bấm Nộp phiếu.</p>' +
      '</div></div>';

    html += '<div class="table-scroll" style="margin-bottom:14px;">' +
      '<table class="official-table">' +
      '<tbody>' +
      '<tr><td style="width:38%;font-weight:700;">Chi bộ</td><td><strong>' + escHtml(branch.name) + '</strong></td></tr>' +
      '<tr><td style="font-weight:700;">Đảng viên bỏ phiếu</td><td><strong>' + escHtml(voter ? voter.displayName : '') + '</strong> (' + escHtml(Data.getRoleMeta(ui.voterRole).label) + ')</td></tr>' +
      '<tr><td style="font-weight:700;">1. Cá nhân tự nhận</td><td><span class="badge ' + selfMeta.badgeClass + '">' + escHtml(selfMeta.label) + '</span></td></tr>' +
      (isComm ? '<tr><td style="font-weight:700;">2. Tập thể Ban Chi ủy</td><td><span class="badge ' + commMeta.badgeClass + '">' + escHtml(commMeta.label) + '</span></td></tr>' : '') +
      '<tr><td style="font-weight:700;">' + (isComm ? '3' : '2') + '. Tập thể Chi bộ</td><td><span class="badge ' + branchMeta.badgeClass + '">' + escHtml(branchMeta.label) + '</span></td></tr>' +
      '</tbody></table></div>';

    html += '<div class="stats-grid">' +
      '<div class="stat-box"><div class="stat-label">HTXSNV (≤ 20%)</div><div class="stat-value">' + htxsnvList.length + ' / ' + r2Info.maxAllowed + '</div></div>' +
      '<div class="stat-box"><div class="stat-label">Hoàn thành tốt NV</div><div class="stat-value" style="color:#15803d;">' + httnvList.length + '</div></div>' +
      '<div class="stat-box"><div class="stat-label">Hoàn thành NV</div><div class="stat-value" style="color:#b45309;">' + htnvList.length + '</div></div>' +
      '<div class="stat-box"><div class="stat-label">Không HTNV</div><div class="stat-value" style="color:#dc2626;">' + khtnvList.length + '</div></div>' +
      '</div>';

    html += '<div style="margin-bottom:12px;">' +
      '<div class="field-label">Danh sách đề xuất Hoàn thành xuất sắc nhiệm vụ (' + htxsnvList.length + ' đồng chí):</div>' +
      (htxsnvList.length
        ? '<div style="display:flex;flex-wrap:wrap;gap:6px;">' + htxsnvList.map(function (m) {
          return '<span class="badge rating-htxsnv">' + escHtml(m.displayName) + '</span>';
        }).join('') + '</div>'
        : '<div style="color:#6b7280;font-size:13.5px;">Chưa chọn đồng chí nào ở mức HTXSNV.</div>') +
      '</div>';

    if (htnvList.length) {
      html += '<div style="margin-bottom:12px;"><div class="field-label">Danh sách Hoàn thành nhiệm vụ (' + htnvList.length + '):</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:6px;">' + htnvList.map(function (m) {
          return '<span class="badge rating-htnv">' + escHtml(m.displayName) + '</span>';
        }).join('') + '</div></div>';
    }

    if (khtnvList.length) {
      html += '<div style="margin-bottom:12px;"><div class="field-label">Danh sách Không hoàn thành nhiệm vụ (' + khtnvList.length + '):</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:6px;">' + khtnvList.map(function (m) {
          return '<span class="badge rating-khtnv">' + escHtml(m.displayName) + '</span>';
        }).join('') + '</div></div>';
    }

    html += '<div class="alert alert-warning"><span>ℹ️</span><div>Sau khi bấm <strong>Nộp phiếu biểu quyết</strong>, phiếu của đồng chí sẽ được ghi nhận vào hệ thống kiểm phiếu và khóa bỏ phiếu trùng.</div></div>';
    html += '</div>';
    return html;
  }

  function renderStep6Success() {
    const r = ui.lastReceipt;
    if (!r) {
      ui.step = 1;
      return renderStep1();
    }
    const branch = Data.getBranchById(r.branchId);
    const rep = Store.computeBranchReport(r.branchId);
    return (
      '<div class="card" style="text-align:center;padding:28px 18px;">' +
      '<div style="font-size:52px;line-height:1;">✅</div>' +
      '<h2 style="color:#15803d;margin:12px 0 6px;font-size:21px;">ĐÃ NỘP PHIẾU BIỂU QUYẾT THÀNH CÔNG</h2>' +
      '<p style="color:#4b5563;margin:0 0 18px;">Xin trân trọng cảm ơn đồng chí <strong>' + escHtml(r.voterDisplayName) + '</strong> (' + escHtml(branch.name) + ').</p>' +
      '<div style="display:inline-block;background:#fef3c7;border:1.5px solid #f59e0b;border-radius:12px;padding:12px 20px;margin-bottom:20px;text-align:left;">' +
      '<div>Mã biên nhận: <strong>' + escHtml(r.id) + '</strong></div>' +
      '<div>Thời gian ghi nhận: <strong>' + escHtml(formatTime(r.submittedAt)) + '</strong></div>' +
      '<div>Tiến độ Chi bộ hiện tại: <strong>' + rep.votedCount + ' / ' + rep.totalMembers + ' đảng viên (' + rep.progressPct + '%)</strong></div>' +
      '</div>' +
      '<div style="display:flex;flex-wrap:wrap;justify-content:center;gap:10px;">' +
      '<button type="button" class="btn btn-primary" data-action="reset-next-voter">Về màn hình đầu (Đảng viên tiếp theo)</button>' +
      '<button type="button" class="btn btn-secondary" data-action="open-admin-from-success">Trang Quản trị &amp; Kiểm phiếu</button>' +
      '</div></div>'
    );
  }

  function renderWizardFooter() {
    const footer = document.getElementById('wizardFooter');
    if (!footer) return;
    if (ui.mode !== 'voter' || ui.step === 6) {
      footer.classList.add('hidden');
      footer.innerHTML = '';
      return;
    }
    footer.classList.remove('hidden');

    const canProceedStep1 = Boolean(ui.voterId) && !Store.hasVoted(ui.voterId);

    let leftBtn = '';
    let rightBtn = '';

    if (ui.step > 1) {
      leftBtn = '<button type="button" class="btn btn-secondary" data-action="prev-step">← Quay lại</button>';
    } else {
      leftBtn = '<span style="font-size:12.5px;color:#6b7280;font-weight:600;">Bước ' + ui.step + ' / 5</span>';
    }

    if (ui.step < 5) {
      const disabled = ui.step === 1 && !canProceedStep1;
      rightBtn = '<button type="button" class="btn btn-primary" data-action="next-step"' + (disabled ? ' disabled' : '') + '>Tiếp tục →</button>';
    } else {
      rightBtn = '<button type="button" class="btn btn-primary" data-action="submit-ballot">✓ Nộp phiếu biểu quyết</button>';
    }

    footer.innerHTML = '<div class="wizard-footer-inner">' + leftBtn + rightBtn + '</div>';
  }

  // ===== ADMIN VIEW & REPORTS =====

  function renderPrintHeader(branch, formTitle, formSubtitle) {
    return (
      '<div class="print-only-header">' +
      renderLogoImg('print-logo') +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">' +
      '<div style="text-align:center;width:48%;">' +
      '<div style="font-weight:700;font-size:11pt;">' + escHtml(Data.DOC_META.upperCommittee) + '</div>' +
      '<div style="font-weight:700;font-size:11.5pt;text-decoration:underline;">' + escHtml(branch.name.toUpperCase()) + '</div>' +
      '</div>' +
      '<div style="text-align:center;width:48%;">' +
      '<div style="font-weight:700;font-size:11pt;">' + escHtml(Data.DOC_META.partyName) + '</div>' +
      '<div style="font-style:italic;font-size:10.5pt;">' + escHtml(Data.DOC_META.reportDateText) + '</div>' +
      '</div></div>' +
      '<div style="text-align:center;margin:10px 0 6px;">' +
      '<div style="font-weight:700;font-size:13pt;">' + escHtml(formTitle) + '</div>' +
      '<div style="font-style:italic;font-size:10.5pt;">' + escHtml(formSubtitle) + '</div>' +
      '<div style="font-style:italic;font-size:10pt;">(Kèm theo ' + escHtml(Data.DOC_META.guidanceRef) + ')</div>' +
      '</div></div>'
    );
  }

  function renderPrintSignatures() {
    return (
      '<div class="print-only-signatures">' +
      '<div><strong>THƯ KÝ HỘI NGHỊ</strong><br/><span style="font-style:italic;font-size:10pt;">(Ký, ghi rõ họ tên)</span><br/><br/><br/><br/></div>' +
      '<div><strong>TỔ TRƯỞNG TỔ KIỂM PHIẾU</strong><br/><span style="font-style:italic;font-size:10pt;">(Ký, ghi rõ họ tên)</span><br/><br/><br/><br/></div>' +
      '<div><strong>T/M CHI BỘ — BÍ THƯ</strong><br/><span style="font-style:italic;font-size:10pt;">(Ký, ghi rõ họ tên)</span><br/><br/><br/><br/></div>' +
      '</div>'
    );
  }

  function ratingCellHtml(code) {
    if (!code) return '<span style="color:#9ca3af;">—</span>';
    const meta = Data.getRatingMeta(code);
    return '<span class="badge ' + meta.badgeClass + '">' + escHtml(meta.label) + '</span>';
  }

  function renderAdminProgress(rep) {
    let html = '<div class="stats-grid">' +
      '<div class="stat-box"><div class="stat-label">Tổng đảng viên</div><div class="stat-value">' + rep.totalMembers + '</div></div>' +
      '<div class="stat-box"><div class="stat-label">Đã bỏ phiếu</div><div class="stat-value" style="color:#15803d;">' + rep.votedCount + '</div></div>' +
      '<div class="stat-box"><div class="stat-label">Chưa bỏ phiếu</div><div class="stat-value" style="color:#b45309;">' + rep.unvotedMembers.length + '</div></div>' +
      '<div class="stat-box"><div class="stat-label">Trần HTXSNV (20%)</div><div class="stat-value">' + rep.proposedHtxsnvCount + ' / ' + rep.maxHtxsnvSeats + '</div></div>' +
      '</div>';

    html += '<div style="margin-bottom:16px;">' +
      '<div style="display:flex;justify-content:space-between;font-weight:700;font-size:13.5px;margin-bottom:5px;">' +
      '<span>Tiến độ bỏ phiếu ' + escHtml(rep.branch.name) + '</span>' +
      '<span>' + rep.votedCount + '/' + rep.totalMembers + ' (' + rep.progressPct + '%)</span>' +
      '</div>' +
      '<div class="progress-track" style="height:12px;"><div class="progress-fill" style="width:' + rep.progressPct + '%"></div></div>' +
      '</div>';

    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;">';

    // Đã bỏ phiếu
    html += '<div><h3 style="margin:0 0 8px;color:#15803d;font-size:15px;">✓ Danh sách đã bỏ phiếu (' + rep.votedMembers.length + ')</h3>';
    if (!rep.ballots.length) {
      html += '<div class="alert alert-info">Chưa có đảng viên nào nộp phiếu.</div>';
    } else {
      html += '<div class="table-scroll"><table class="official-table"><thead><tr>' +
        '<th>STT</th><th>Họ và tên</th><th>Tự nhận</th><th>Thao tác</th>' +
        '</tr></thead><tbody>';
      rep.ballots.forEach(function (b) {
        const selfMeta = Data.getRatingMeta(b.selfRating);
        html += '<tr>' +
          '<td class="text-center">' + b.voterStt + '</td>' +
          '<td><strong>' + escHtml(b.voterDisplayName) + '</strong><div style="font-size:11.5px;color:#6b7280;">' + escHtml(Data.getRoleMeta(b.voterRole).label) + ' • ' + escHtml(formatTime(b.submittedAt)) + '</div></td>' +
          '<td class="text-center"><span class="badge ' + selfMeta.badgeClass + '">' + selfMeta.shortLabel + '</span></td>' +
          '<td class="text-center"><button type="button" class="btn btn-danger-outline btn-sm" data-action="unlock-vote" data-member-id="' + escHtml(b.voterId) + '">Mở khóa</button></td>' +
          '</tr>';
      });
      html += '</tbody></table></div>';
    }
    html += '</div>';

    // Chưa bỏ phiếu
    html += '<div><h3 style="margin:0 0 8px;color:#b45309;font-size:15px;">⏳ Danh sách chưa bỏ phiếu (' + rep.unvotedMembers.length + ')</h3>';
    if (!rep.unvotedMembers.length) {
      html += '<div class="alert alert-success">100% đảng viên trong Chi bộ đã hoàn thành bỏ phiếu!</div>';
    } else {
      html += '<div class="table-scroll"><table class="official-table"><thead><tr>' +
        '<th>STT</th><th>Họ và tên</th><th>Chức vụ</th>' +
        '</tr></thead><tbody>';
      rep.unvotedMembers.forEach(function (m) {
        html += '<tr>' +
          '<td class="text-center">' + m.stt + '</td>' +
          '<td>' + escHtml(m.displayName) + '</td>' +
          '<td class="text-center">' + escHtml(m.roleMeta.label) + '</td>' +
          '</tr>';
      });
      html += '</tbody></table></div>';
    }
    html += '</div></div>';

    return html;
  }

  function renderMau07(rep) {
    let html = renderPrintHeader(
      rep.branch,
      'BẢNG TỔNG HỢP KẾT QUẢ BIỂU QUYẾT XẾP LOẠI ĐẢNG VIÊN NĂM 2026',
      'Mẫu số 07 — Tổng số phiếu thu về: ' + rep.votedCount + '/' + rep.totalMembers + ' đảng viên'
    );

    html += '<div class="alert alert-info no-print" style="justify-content:space-between;flex-wrap:wrap;">' +
      '<span><strong>Mẫu số 07:</strong> Sắp xếp thứ tự số phiếu <strong>HTXSNV</strong> từ cao xuống thấp. Tự động đề xuất tối đa 20% trên số đạt HTTNV trở lên.</span>' +
      '<span>Đủ điều kiện HTTNV+: <strong>' + rep.httnvEligibleCount + '</strong> • Trần 20%: <strong>' + rep.proposedHtxsnvCount + '/' + rep.maxHtxsnvSeats + '</strong> đ/c</span>' +
      '</div>';

    html += '<div class="table-scroll"><table class="official-table">' +
      '<thead><tr>' +
      '<th>TT</th><th>STT DS</th><th>Họ và tên đảng viên</th><th>Tự nhận</th>' +
      '<th>Phiếu HTXSNV</th><th>Phiếu HTTNV</th><th>Phiếu HTNV</th><th>Phiếu KHTNV</th>' +
      '<th>Đề xuất xếp loại</th>' +
      '</tr></thead><tbody>';

    rep.mau07Rows.forEach(function (r, idx) {
      html += '<tr class="' + (r.isProposedHTXSNV ? 'row-htxsnv' : '') + '">' +
        '<td class="text-center">' + (idx + 1) + '</td>' +
        '<td class="text-center">' + r.member.stt + '</td>' +
        '<td><strong>' + escHtml(r.member.displayName) + '</strong>' +
        (r.member.role !== 'DANG_VIEN' ? ' <span class="badge badge-role">' + escHtml(r.member.roleMeta.label) + '</span>' : '') +
        '</td>' +
        '<td class="text-center">' + (r.selfRating ? '<span class="badge ' + Data.getRatingMeta(r.selfRating).badgeClass + '">' + r.selfRating + '</span>' : '—') + '</td>' +
        '<td class="text-center"><strong>' + r.counts.HTXSNV + '</strong> (' + r.pct.HTXSNV + '%)</td>' +
        '<td class="text-center">' + r.counts.HTTNV + ' (' + r.pct.HTTNV + '%)</td>' +
        '<td class="text-center">' + r.counts.HTNV + ' (' + r.pct.HTNV + '%)</td>' +
        '<td class="text-center">' + r.counts.KHTNV + ' (' + r.pct.KHTNV + '%)</td>' +
        '<td class="text-center">' + ratingCellHtml(r.proposedRating) +
        (r.isProposedHTXSNV ? '<div style="font-size:11px;color:#b91c1c;font-weight:700;">Top ' + r.htxsnvRank + ' (≤20%)</div>' : '') +
        '</td></tr>';
    });

    html += '</tbody></table></div>';
    html += renderPrintSignatures();
    return html;
  }

  function renderCollectiveSummaryTable(summary, titleLabel) {
    let html = '<div class="table-scroll"><table class="official-table">' +
      '<thead><tr><th>Mức xếp loại chất lượng</th><th>Số phiếu đồng ý</th><th>Tỷ lệ (%)</th><th>Ghi chú</th></tr></thead><tbody>';
    Data.RATINGS.forEach(function (r) {
      const cnt = summary.counts[r.code];
      const p = summary.pct[r.code];
      const isWinner = summary.proposed === r.code && summary.totalVotes > 0;
      html += '<tr class="' + (isWinner ? 'row-htxsnv' : '') + '">' +
        '<td><strong>' + r.order + '. ' + escHtml(r.label) + '</strong></td>' +
        '<td class="text-center"><strong>' + cnt + '</strong> / ' + summary.totalVotes + '</td>' +
        '<td class="text-center"><strong>' + p + '%</strong></td>' +
        '<td class="text-center">' + (isWinner ? '<span class="badge rating-htxsnv">Mức đạt đa số đề xuất</span>' : '') + '</td>' +
        '</tr>';
    });
    html += '</tbody></table></div>';
    html += '<div style="margin-top:12px;padding:12px;border:1.5px solid #f59e0b;border-radius:10px;background:#fffbeb;">' +
      '<strong>Kết quả đề xuất xếp loại ' + escHtml(titleLabel) + ' năm 2026:</strong> ' +
      ratingCellHtml(summary.proposed) +
      '</div>';
    return html;
  }

  function renderMau3a1(rep) {
    let html = renderPrintHeader(
      rep.branch,
      'BIỂU TỔNG HỢP ĐỀ XUẤT XẾP LOẠI CHI BỘ NĂM 2026',
      'Mẫu số 3a & 3a1 — Tính trên tổng số phiếu toàn thể đảng viên (' + rep.branchSummary.totalVotes + '/' + rep.totalMembers + ' phiếu)'
    );
    html += '<div class="alert alert-info no-print"><span>ℹ️</span><div><strong>Mẫu số 3a &amp; 3a1:</strong> Tổng hợp kết quả biểu quyết xếp loại tập thể <strong>' + escHtml(rep.branch.name) + '</strong> từ phiếu của toàn thể đảng viên.</div></div>';
    html += renderCollectiveSummaryTable(rep.branchSummary, rep.branch.name);
    html += renderPrintSignatures();
    return html;
  }

  function renderMau3a2(rep) {
    let html = renderPrintHeader(
      rep.branch,
      'BIỂU TỔNG HỢP ĐỀ XUẤT XẾP LOẠI CHI ỦY CHI BỘ NĂM 2026',
      'Mẫu số 3a2 — Tính riêng trên tổng số phiếu của Ban Chi ủy (' + rep.committeeSummary.totalVotes + '/' + rep.committeeSummary.configuredCount + ' phiếu Ban Chi ủy)'
    );
    html += '<div class="alert alert-info no-print"><span>ℹ️</span><div><strong>Mẫu số 3a2:</strong> Chỉ tính trên phiếu của các đồng chí thuộc <strong>Ban Chi ủy</strong> (Bí thư, Phó Bí thư, Chi ủy viên). Cấu hình hiện tại: <strong>' + rep.committeeSummary.configuredCount + '</strong> đồng chí trong Ban Chi ủy, đã bỏ phiếu: <strong>' + rep.committeeSummary.totalVotes + '</strong>.</div></div>';
    if (rep.committeeSummary.configuredCount === 0) {
      html += '<div class="alert alert-warning">Chi bộ này chưa cấu hình danh sách Ban Chi ủy. Vui lòng vào tab <strong>"Cấu hình Chi ủy"</strong> để chọn Bí thư, Phó Bí thư, Chi ủy viên.</div>';
    }
    html += renderCollectiveSummaryTable(rep.committeeSummary, 'Ban Chi ủy ' + rep.branch.shortName);
    html += renderPrintSignatures();
    return html;
  }

  function renderMau3a3(rep) {
    let html = renderPrintHeader(
      rep.branch,
      'BIỂU TỔNG HỢP ĐỀ XUẤT XẾP LOẠI BÍ THƯ, PHÓ BÍ THƯ, CHI ỦY VIÊN NĂM 2026',
      'Mẫu số 3a3 — Cấp ủy viên ' + rep.branch.name
    );
    html += '<div class="alert alert-info no-print"><span>ℹ️</span><div><strong>Mẫu số 3a3:</strong> Lọc riêng các đồng chí giữ chức vụ Bí thư, Phó Bí thư, Chi ủy viên của Chi bộ.</div></div>';

    if (!rep.mau3a3Rows.length) {
      html += '<div class="alert alert-warning">Chưa có đồng chí nào được gán chức vụ Bí thư / Phó Bí thư / Chi ủy viên trong Chi bộ này. Vui lòng cấu hình tại tab <strong>Cấu hình Chi ủy</strong>.</div>';
    } else {
      html += '<div class="table-scroll"><table class="official-table">' +
        '<thead><tr>' +
        '<th>TT</th><th>STT DS</th><th>Họ và tên</th><th>Chức vụ Đảng</th><th>Tự nhận</th>' +
        '<th>HTXSNV</th><th>HTTNV</th><th>HTNV</th><th>KHTNV</th><th>Đề xuất xếp loại 2026</th>' +
        '</tr></thead><tbody>';
      rep.mau3a3Rows.forEach(function (r, idx) {
        html += '<tr class="' + (r.isProposedHTXSNV ? 'row-htxsnv' : '') + '">' +
          '<td class="text-center">' + (idx + 1) + '</td>' +
          '<td class="text-center">' + r.member.stt + '</td>' +
          '<td><strong>' + escHtml(r.member.displayName) + '</strong></td>' +
          '<td class="text-center"><span class="badge badge-role">' + escHtml(r.member.roleMeta.label) + '</span></td>' +
          '<td class="text-center">' + ratingCellHtml(r.selfRating) + '</td>' +
          '<td class="text-center">' + r.counts.HTXSNV + ' (' + r.pct.HTXSNV + '%)</td>' +
          '<td class="text-center">' + r.counts.HTTNV + ' (' + r.pct.HTTNV + '%)</td>' +
          '<td class="text-center">' + r.counts.HTNV + ' (' + r.pct.HTNV + '%)</td>' +
          '<td class="text-center">' + r.counts.KHTNV + ' (' + r.pct.KHTNV + '%)</td>' +
          '<td class="text-center">' + ratingCellHtml(r.proposedRating) + '</td>' +
          '</tr>';
      });
      html += '</tbody></table></div>';
    }
    html += renderPrintSignatures();
    return html;
  }

  function renderMau3a4(rep) {
    let html = renderPrintHeader(
      rep.branch,
      'BIỂU TỔNG HỢP ĐỀ XUẤT XẾP LOẠI ĐẢNG VIÊN NĂM 2026',
      'Mẫu số 3a4 — Tổng số: ' + rep.totalMembers + ' đảng viên'
    );

    html += '<div class="stats-grid no-print">' +
      '<div class="stat-box"><div class="stat-label">Đề xuất HTXSNV</div><div class="stat-value">' + rep.summaryProposed.HTXSNV + '</div></div>' +
      '<div class="stat-box"><div class="stat-label">Đề xuất HTTNV</div><div class="stat-value" style="color:#15803d;">' + rep.summaryProposed.HTTNV + '</div></div>' +
      '<div class="stat-box"><div class="stat-label">Đề xuất HTNV</div><div class="stat-value" style="color:#b45309;">' + rep.summaryProposed.HTNV + '</div></div>' +
      '<div class="stat-box"><div class="stat-label">Đề xuất KHTNV</div><div class="stat-value" style="color:#dc2626;">' + rep.summaryProposed.KHTNV + '</div></div>' +
      '</div>';

    html += '<div class="table-scroll"><table class="official-table">' +
      '<thead><tr>' +
      '<th>STT</th><th>Họ và tên đảng viên</th><th>Chức vụ</th><th>Cá nhân tự nhận</th>' +
      '<th>HTXSNV</th><th>HTTNV</th><th>HTNV</th><th>KHTNV</th><th>Kết quả đề xuất 2026</th>' +
      '</tr></thead><tbody>';

    rep.mau3a4Rows.forEach(function (r) {
      html += '<tr class="' + (r.isProposedHTXSNV ? 'row-htxsnv' : '') + '">' +
        '<td class="text-center">' + r.member.stt + '</td>' +
        '<td><strong>' + escHtml(r.member.displayName) + '</strong></td>' +
        '<td class="text-center">' + escHtml(r.member.roleMeta.label) + '</td>' +
        '<td class="text-center">' + ratingCellHtml(r.selfRating) + '</td>' +
        '<td class="text-center">' + r.counts.HTXSNV + '</td>' +
        '<td class="text-center">' + r.counts.HTTNV + '</td>' +
        '<td class="text-center">' + r.counts.HTNV + '</td>' +
        '<td class="text-center">' + r.counts.KHTNV + '</td>' +
        '<td class="text-center">' + ratingCellHtml(r.proposedRating) + '</td>' +
        '</tr>';
    });

    html += '</tbody></table></div>';
    html += renderPrintSignatures();
    return html;
  }

  function renderAdminConfig(rep) {
    const st = Store.getState();
    let html = '<div class="alert alert-info"><span>⚙️</span><div>Cấu hình chức vụ Ban Chi ủy cho từng đồng chí trong <strong>' + escHtml(rep.branch.name) + '</strong>. Các đồng chí giữ chức vụ Bí thư, Phó Bí thư, Chi ủy viên sẽ tự động được cấp quyền đánh giá tập thể Ban Chi ủy tại Bước 3 và tổng hợp riêng vào Mẫu 3a2, 3a3.</div></div>';

    html += '<div class="table-scroll" style="margin-bottom:18px;"><table class="official-table">' +
      '<thead><tr><th>STT</th><th>Họ và tên</th><th>Năm sinh (tuỳ chọn)</th><th>Chức vụ Đảng trong Chi bộ</th></tr></thead><tbody>';

    rep.members.forEach(function (m) {
      html += '<tr>' +
        '<td class="text-center">' + m.stt + '</td>' +
        '<td><strong>' + escHtml(m.name) + '</strong>' + (m.birthYear ? ' <span style="color:#6b7280;">(' + escHtml(m.birthYear) + ')</span>' : '') + '</td>' +
        '<td class="text-center" style="width:120px;"><input type="text" class="input-control" style="padding:6px 8px;font-size:13px;" placeholder="VD: 1980" value="' + escHtml(m.birthYear) + '" data-action="edit-birthyear" data-member-id="' + escHtml(m.id) + '" /></td>' +
        '<td style="width:200px;"><select class="select-control" style="padding:6px 8px;font-size:13.5px;" data-action="change-member-role" data-member-id="' + escHtml(m.id) + '">' +
        Data.ROLES.map(function (r) {
          return '<option value="' + r.code + '"' + (m.role === r.code ? ' selected' : '') + '>' + escHtml(r.label) + '</option>';
        }).join('') +
        '</select></td></tr>';
    });
    html += '</tbody></table></div>';

    // Cấu hình bảo mật & đồng bộ
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;">';

    html += '<div class="stat-box">' +
      '<h4 style="margin:0 0 8px;color:#7f1d1d;">🔐 Đổi mã PIN Quản trị</h4>' +
      '<div style="display:flex;gap:8px;">' +
      '<input type="password" id="newPinInput" class="input-control" placeholder="Mã PIN mới (≥ 4 ký tự)" />' +
      '<button type="button" class="btn btn-primary btn-sm" data-action="save-pin">Lưu PIN</button>' +
      '</div></div>';

    html += '<div class="stat-box">' +
      '<h4 style="margin:0 0 8px;color:#7f1d1d;">☁️ Đồng bộ Cloud (Firebase RTDB REST - Tuỳ chọn)</h4>' +
      '<div style="display:flex;gap:8px;margin-bottom:6px;">' +
      '<input type="url" id="syncUrlInput" class="input-control" placeholder="https://your-db.firebaseio.com/muonglam2026" value="' + escHtml(st.syncUrl) + '" />' +
      '<button type="button" class="btn btn-primary btn-sm" data-action="save-sync-url">Kết nối</button>' +
      '</div>' +
      '<div style="font-size:12px;color:#6b7280;">Mặc định ứng dụng đồng bộ tức thì qua LocalStorage + BroadcastChannel. Nếu dùng nhiều điện thoại qua Internet, dán URL Firebase Realtime Database vào đây.</div>' +
      '</div>';

    html += '<div class="stat-box">' +
      '<h4 style="margin:0 0 8px;color:#7f1d1d;">💾 Gom phiếu / Sao lưu JSON (Offline)</h4>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;">' +
      '<button type="button" class="btn btn-secondary btn-sm" data-action="export-json">Tải file JSON phiếu</button>' +
      '<label class="btn btn-gold btn-sm" style="cursor:pointer;">Gộp file JSON từ máy khác<input type="file" id="importJsonFile" accept=".json" class="hidden" /></label>' +
      '</div></div>';

    html += '</div>';
    return html;
  }

  function renderAdminView() {
    const rep = Store.computeBranchReport(ui.adminBranchId);
    const tabs = [
      { id: 'progress', label: '1. Tiến độ & QR' },
      { id: 'mau07', label: '2. Mẫu số 07' },
      { id: 'mau3a1', label: '3. Mẫu 3a & 3a1 (Chi bộ)' },
      { id: 'mau3a2', label: '4. Mẫu 3a2 (Ban Chi ủy)' },
      { id: 'mau3a3', label: '5. Mẫu 3a3 (Cấp ủy viên)' },
      { id: 'mau3a4', label: '6. Mẫu 3a4 (Đảng viên)' },
      { id: 'config', label: '7. Cấu hình Chi ủy' }
    ];

    let html = '<div class="card">';
    html += '<div class="card-header no-print" style="flex-wrap:wrap;">' +
      '<div class="admin-brand-row">' +
      renderLogoImg('admin-logo') +
      '<div>' +
      '<h2 class="card-title">Trang Quản trị &amp; Tổng hợp Kiểm phiếu</h2>' +
      '<p class="card-subtitle">Thư ký / Tổ kiểm phiếu — ' + escHtml(Data.DOC_META.guidanceRef) + '</p>' +
      '</div></div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;">' +
      '<button type="button" class="btn btn-gold btn-sm" data-action="open-qr-modal">📱 Mã QR Chiếu hội trường</button>' +
      '<button type="button" class="btn btn-primary btn-sm" data-action="export-xlsx">📊 Xuất Excel (.xlsx)</button>' +
      '<button type="button" class="btn btn-secondary btn-sm" data-action="print-a4">🖨️ In biểu mẫu A4</button>' +
      '<button type="button" class="btn btn-secondary btn-sm" data-action="seed-demo">🧪 Tạo dữ liệu mẫu</button>' +
      '<button type="button" class="btn btn-danger-outline btn-sm" data-action="clear-branch-votes">🗑️ Xóa phiếu Chi bộ này</button>' +
      '</div></div>';

    // Chọn Chi bộ cần tổng hợp
    html += '<div class="branch-grid no-print" style="margin-bottom:14px;">' +
      Data.BRANCHES.map(function (b) {
        const r = Store.computeBranchReport(b.id);
        return '<button type="button" class="branch-card ' + (ui.adminBranchId === b.id ? 'selected' : '') + '" data-action="select-admin-branch" data-branch="' + b.id + '">' +
          '<div class="branch-name">' + escHtml(b.name) + '</div>' +
          '<div class="branch-meta">Đã nộp: <strong>' + r.votedCount + ' / ' + r.totalMembers + '</strong> (' + r.progressPct + '%)</div>' +
          '</button>';
      }).join('') +
      '</div>';

    // Tabs báo cáo
    html += '<div class="admin-tabs no-print">' +
      tabs.map(function (t) {
        return '<button type="button" class="admin-tab ' + (ui.adminTab === t.id ? 'active' : '') + '" data-action="switch-admin-tab" data-tab="' + t.id + '">' + escHtml(t.label) + '</button>';
      }).join('') +
      '</div>';

    // Nội dung tab
    if (ui.adminTab === 'progress') html += renderAdminProgress(rep);
    else if (ui.adminTab === 'mau07') html += renderMau07(rep);
    else if (ui.adminTab === 'mau3a1') html += renderMau3a1(rep);
    else if (ui.adminTab === 'mau3a2') html += renderMau3a2(rep);
    else if (ui.adminTab === 'mau3a3') html += renderMau3a3(rep);
    else if (ui.adminTab === 'mau3a4') html += renderMau3a4(rep);
    else if (ui.adminTab === 'config') html += renderAdminConfig(rep);

    html += '</div>';
    return html;
  }

  // ===== MODALS (PIN & QR) =====

  function openPinModal() {
    const root = document.getElementById('modalRoot');
    if (!root) return;
    root.classList.remove('hidden');
    root.innerHTML =
      '<div class="modal-backdrop" id="pinBackdrop">' +
      '<div class="modal-box">' +
      '<h3 style="margin:0 0 6px;color:#7f1d1d;">🔐 Xác thực Thư ký / Tổ kiểm phiếu</h3>' +
      '<p style="margin:0 0 14px;font-size:13.5px;color:#4b5563;">Nhập mã PIN để truy cập Trang Quản trị &amp; Tổng hợp kết quả (Mặc định: <strong>2026</strong>).</p>' +
      '<form id="pinForm">' +
      '<input type="password" id="pinInput" class="input-control" placeholder="Nhập mã PIN..." autofocus inputmode="numeric" />' +
      '<div id="pinError" style="color:#dc2626;font-size:13px;font-weight:700;margin-top:6px;" class="hidden">Mã PIN không đúng, vui lòng thử lại.</div>' +
      '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px;">' +
      '<button type="button" class="btn btn-secondary" data-action="close-modal">Hủy</button>' +
      '<button type="submit" class="btn btn-primary">Mở khóa</button>' +
      '</div></form></div></div>';
    setTimeout(function () {
      const inp = document.getElementById('pinInput');
      if (inp) inp.focus();
    }, 30);
  }

  function getQrTargetUrl(branchId) {
    let base = ui.qrBaseUrl;
    if (!base) {
      base = window.location.href.split('?')[0].split('#')[0];
    }
    return base + '?branch=' + encodeURIComponent(branchId);
  }

  function openQrModal() {
    const root = document.getElementById('modalRoot');
    if (!root) return;
    if (!ui.qrBaseUrl) {
      ui.qrBaseUrl = window.location.href.split('?')[0].split('#')[0];
    }
    const targetUrl = getQrTargetUrl(ui.qrBranchFilter);
    const branch = Data.getBranchById(ui.qrBranchFilter);
    let qrSvg = '';
    try {
      qrSvg = global.QRGen.renderSVG(targetUrl, 250);
    } catch (e) {
      qrSvg = '<div class="alert alert-danger">' + escHtml(e.message) + '</div>';
    }

    const isFileProto = targetUrl.startsWith('file://');

    root.classList.remove('hidden');
    root.innerHTML =
      '<div class="modal-backdrop">' +
      '<div class="modal-box modal-wide" style="text-align:center;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
      '<h3 style="margin:0;color:#7f1d1d;">📱 MÃ QR TRUY CẬP NHANH BỎ PHIẾU</h3>' +
      '<button type="button" class="btn btn-secondary btn-sm" data-action="close-modal">✕ Đóng</button>' +
      '</div>' +
      '<div style="display:flex;justify-content:center;gap:8px;margin-bottom:12px;">' +
      '<button type="button" class="btn btn-sm ' + (ui.qrBranchFilter === 'na-tau' ? 'btn-primary' : 'btn-secondary') + '" data-action="set-qr-branch" data-branch="na-tau">Chi bộ bản Nà Tấu</button>' +
      '<button type="button" class="btn btn-sm ' + (ui.qrBranchFilter === 'phen-sang' ? 'btn-primary' : 'btn-secondary') + '" data-action="set-qr-branch" data-branch="phen-sang">Chi bộ bản Phèn Sàng</button>' +
      '</div>' +
      '<div style="background:linear-gradient(135deg,#7f1d1d,#b91c1c);padding:18px;border-radius:16px;border:3px solid #facc15;color:#fff;margin-bottom:12px;">' +
      '<div style="margin-bottom:8px;">' + renderLogoImg('print-logo') + '</div>' +
      '<div style="font-size:12px;color:#fde047;font-weight:700;letter-spacing:0.06em;">ĐẢNG BỘ XÃ MƯỜNG LẦM • TỈNH SƠN LA</div>' +
      '<div style="font-size:18px;font-weight:800;margin:4px 0 12px;">' + escHtml(branch.name.toUpperCase()) + '</div>' +
      '<div style="display:inline-block;background:#fff;padding:10px;border-radius:12px;">' + qrSvg + '</div>' +
      '<div style="font-size:13px;margin-top:10px;color:#fef08a;">Quét mã QR bằng Camera điện thoại hoặc Zalo để đánh giá, xếp loại năm 2026</div>' +
      '</div>' +
      (isFileProto
        ? '<div class="alert alert-warning text-left"><span>⚠️</span><div>Trang đang mở trực tiếp từ tệp máy tính (<code>file://</code>). Khi chiếu cho đảng viên quét bằng điện thoại, hãy nhập địa chỉ Web/LAN (ví dụ <code>http://192.168.1.10:8080</code> hoặc tên miền đã triển khai) vào ô bên dưới để cập nhật mã QR.</div></div>'
        : '') +
      '<div class="text-left">' +
      '<label class="field-label">Đường dẫn gốc tạo mã QR:</label>' +
      '<div style="display:flex;gap:8px;">' +
      '<input type="text" id="qrBaseUrlInput" class="input-control" value="' + escHtml(ui.qrBaseUrl) + '" />' +
      '<button type="button" class="btn btn-primary btn-sm" data-action="update-qr-url">Cập nhật QR</button>' +
      '</div>' +
      '<div style="font-size:12px;color:#6b7280;margin-top:6px;word-break:break-all;">URL đầy đủ: <code>' + escHtml(targetUrl) + '</code></div>' +
      '</div></div></div>';
  }

  function closeModal() {
    const root = document.getElementById('modalRoot');
    if (root) {
      root.classList.add('hidden');
      root.innerHTML = '';
    }
  }

  // ===== EXCEL EXPORT (5 OFFICIAL SHEETS) =====

  function handleExportXlsx() {
    const rep = Store.computeBranchReport(ui.adminBranchId);
    const branch = rep.branch;

    function headerBanner(title) {
      return [
        [{ v: Data.DOC_META.upperCommittee + ' — ' + branch.name.toUpperCase(), s: 1 }],
        [{ v: title, s: 1 }],
        [{ v: Data.DOC_META.guidanceRef + ' | ' + Data.DOC_META.reportDateText, s: 0 }],
        []
      ];
    }

    // Sheet 1: Mẫu số 07
    const s07Rows = headerBanner('MẪU SỐ 07: BẢNG TỔNG HỢP KẾT QUẢ BIỂU QUYẾT XẾP LOẠI ĐẢNG VIÊN NĂM 2026')
      .concat([[
        { v: 'TT', s: 2 }, { v: 'STT DS', s: 2 }, { v: 'Họ và tên đảng viên', s: 2 }, { v: 'Chức vụ', s: 2 },
        { v: 'Cá nhân tự nhận', s: 2 },
        { v: 'Phiếu HTXSNV', s: 2 }, { v: 'Tỷ lệ HTXSNV (%)', s: 2 },
        { v: 'Phiếu HTTNV', s: 2 }, { v: 'Tỷ lệ HTTNV (%)', s: 2 },
        { v: 'Phiếu HTNV', s: 2 }, { v: 'Tỷ lệ HTNV (%)', s: 2 },
        { v: 'Phiếu KHTNV', s: 2 }, { v: 'Tỷ lệ KHTNV (%)', s: 2 },
        { v: 'Đề xuất xếp loại 2026', s: 2 }
      ]])
      .concat(rep.mau07Rows.map(function (r, idx) {
        const st = r.isProposedHTXSNV ? 5 : 3;
        return [
          { v: idx + 1, s: st },
          { v: r.member.stt, s: st },
          { v: r.member.displayName, s: st },
          { v: r.member.roleMeta.label, s: st },
          { v: r.selfRating ? Data.getRatingMeta(r.selfRating).label : 'Chưa nộp', s: st },
          { v: r.counts.HTXSNV, s: st },
          { v: r.pct.HTXSNV, s: st },
          { v: r.counts.HTTNV, s: st },
          { v: r.pct.HTTNV, s: st },
          { v: r.counts.HTNV, s: st },
          { v: r.pct.HTNV, s: st },
          { v: r.counts.KHTNV, s: st },
          { v: r.pct.KHTNV, s: st },
          { v: r.proposedRating ? Data.getRatingMeta(r.proposedRating).label : 'Chưa có phiếu', s: r.isProposedHTXSNV ? 5 : 4 }
        ];
      }));

    // Sheet 2: Mẫu 3a & 3a1 (Chi bộ)
    const s3a1Rows = headerBanner('MẪU SỐ 3a & 3a1: TỔNG HỢP ĐỀ XUẤT XẾP LOẠI CHI BỘ NĂM 2026')
      .concat([[
        { v: 'Mức xếp loại chất lượng', s: 2 },
        { v: 'Số phiếu đồng ý', s: 2 },
        { v: 'Tổng số phiếu', s: 2 },
        { v: 'Tỷ lệ (%)', s: 2 },
        { v: 'Kết quả đề xuất', s: 2 }
      ]])
      .concat(Data.RATINGS.map(function (rt) {
        const win = rep.branchSummary.proposed === rt.code && rep.branchSummary.totalVotes > 0;
        const st = win ? 5 : 3;
        return [
          { v: rt.label, s: st },
          { v: rep.branchSummary.counts[rt.code], s: st },
          { v: rep.branchSummary.totalVotes, s: st },
          { v: rep.branchSummary.pct[rt.code], s: st },
          { v: win ? 'Đề xuất xếp loại' : '', s: st }
        ];
      }));

    // Sheet 3: Mẫu 3a2 (Ban Chi ủy)
    const s3a2Rows = headerBanner('MẪU SỐ 3a2: TỔNG HỢP ĐỀ XUẤT XẾP LOẠI CHI ỦY CHI BỘ NĂM 2026')
      .concat([[
        { v: 'Mức xếp loại chất lượng', s: 2 },
        { v: 'Số phiếu Ban Chi ủy', s: 2 },
        { v: 'Tổng phiếu Ban Chi ủy', s: 2 },
        { v: 'Tỷ lệ (%)', s: 2 },
        { v: 'Kết quả đề xuất', s: 2 }
      ]])
      .concat(Data.RATINGS.map(function (rt) {
        const win = rep.committeeSummary.proposed === rt.code && rep.committeeSummary.totalVotes > 0;
        const st = win ? 5 : 3;
        return [
          { v: rt.label, s: st },
          { v: rep.committeeSummary.counts[rt.code], s: st },
          { v: rep.committeeSummary.totalVotes, s: st },
          { v: rep.committeeSummary.pct[rt.code], s: st },
          { v: win ? 'Đề xuất xếp loại' : '', s: st }
        ];
      }));

    // Sheet 4: Mẫu 3a3 (Bí thư, Phó Bí thư, Chi ủy viên)
    const s3a3Rows = headerBanner('MẪU SỐ 3a3: BIỂU TỔNG HỢP ĐỀ XUẤT XẾP LOẠI BÍ THƯ, PHÓ BÍ THƯ, CHI ỦY VIÊN NĂM 2026')
      .concat([[
        { v: 'TT', s: 2 }, { v: 'STT DS', s: 2 }, { v: 'Họ và tên', s: 2 }, { v: 'Chức vụ Đảng', s: 2 },
        { v: 'Tự nhận', s: 2 }, { v: 'HTXSNV', s: 2 }, { v: 'HTTNV', s: 2 }, { v: 'HTNV', s: 2 }, { v: 'KHTNV', s: 2 },
        { v: 'Đề xuất xếp loại 2026', s: 2 }
      ]])
      .concat(rep.mau3a3Rows.map(function (r, idx) {
        const st = r.isProposedHTXSNV ? 5 : 3;
        return [
          { v: idx + 1, s: st },
          { v: r.member.stt, s: st },
          { v: r.member.displayName, s: st },
          { v: r.member.roleMeta.label, s: st },
          { v: r.selfRating ? Data.getRatingMeta(r.selfRating).label : 'Chưa nộp', s: st },
          { v: r.counts.HTXSNV, s: st },
          { v: r.counts.HTTNV, s: st },
          { v: r.counts.HTNV, s: st },
          { v: r.counts.KHTNV, s: st },
          { v: r.proposedRating ? Data.getRatingMeta(r.proposedRating).label : 'Chưa có phiếu', s: 4 }
        ];
      }));

    // Sheet 5: Mẫu 3a4 (Đảng viên năm 2026)
    const s3a4Rows = headerBanner('MẪU SỐ 3a4: BIỂU TỔNG HỢP ĐỀ XUẤT XẾP LOẠI ĐẢNG VIÊN NĂM 2026')
      .concat([[
        { v: 'STT', s: 2 }, { v: 'Họ và tên đảng viên', s: 2 }, { v: 'Chức vụ Đảng', s: 2 },
        { v: 'Cá nhân tự nhận', s: 2 }, { v: 'HTXSNV', s: 2 }, { v: 'HTTNV', s: 2 }, { v: 'HTNV', s: 2 }, { v: 'KHTNV', s: 2 },
        { v: 'Kết quả đề xuất xếp loại', s: 2 }
      ]])
      .concat(rep.mau3a4Rows.map(function (r) {
        const st = r.isProposedHTXSNV ? 5 : 3;
        return [
          { v: r.member.stt, s: st },
          { v: r.member.displayName, s: st },
          { v: r.member.roleMeta.label, s: st },
          { v: r.selfRating ? Data.getRatingMeta(r.selfRating).label : 'Chưa nộp', s: st },
          { v: r.counts.HTXSNV, s: st },
          { v: r.counts.HTTNV, s: st },
          { v: r.counts.HTNV, s: st },
          { v: r.counts.KHTNV, s: st },
          { v: r.proposedRating ? Data.getRatingMeta(r.proposedRating).label : 'Chưa có phiếu', s: 4 }
        ];
      }));

    const fileName = 'Bao_cao_xep_loai_' + branch.id + '_2026.xlsx';
    global.XlsxExport.exportWorkbook(fileName, [
      { name: 'Mau_07_Bieu_Quyet', cols: [6, 8, 28, 16, 26, 13, 15, 13, 15, 13, 15, 13, 15, 28], rows: s07Rows },
      { name: 'Mau_3a_3a1_Chi_Bo', cols: [32, 16, 16, 14, 24], rows: s3a1Rows },
      { name: 'Mau_3a2_Ban_Chi_Uy', cols: [32, 18, 18, 14, 24], rows: s3a2Rows },
      { name: 'Mau_3a3_Cap_Uy_Vien', cols: [6, 8, 28, 16, 26, 10, 10, 10, 10, 28], rows: s3a3Rows },
      { name: 'Mau_3a4_Dang_Vien_2026', cols: [8, 28, 16, 26, 10, 10, 10, 10, 28], rows: s3a4Rows }
    ]);
    showToast('Đã xuất tệp Excel: ' + fileName);
  }

  function renderSiteFooter() {
    const el = document.getElementById('appFooter');
    if (!el) return;
    const s = Data.SUPPORT_INFO;
    el.innerHTML =
      '<div class="site-footer-grid">' +
      '<div style="flex:1;min-width:240px;">' +
      '<div class="site-footer-org">' + escHtml(s.teamName) + '</div>' +
      '<div>Theo ' + escHtml(s.decisionRef) + ' (' + escHtml(s.scopeNote) + ').</div>' +
      '<div style="margin-top:4px;">Thư ký / Hỗ trợ trực tiếp: <strong>Đồng chí ' + escHtml(s.officerName) + '</strong> — ' + escHtml(s.officerTitle) + ' (<em>' + escHtml(s.teamRole) + '</em>).</div>' +
      '</div>' +
      '<div class="support-actions-row" style="margin-top:0;">' +
      '<a href="tel:' + escHtml(s.phoneTel) + '" class="support-action-link support-action-call" style="border-color:#facc15;">📞 ĐT: ' + escHtml(s.phoneDisplay) + '</a>' +
      '<a href="' + escHtml(s.zaloUrl) + '" target="_blank" rel="noopener noreferrer" class="support-action-link support-action-zalo">💬 Zalo Đ/c Quyền</a>' +
      '</div>' +
      '</div>';
  }

  function renderFloatingSupport() {
    const el = document.getElementById('floatingSupport');
    if (!el) return;
    const s = Data.SUPPORT_INFO;
    const footerHidden = ui.mode !== 'voter' || ui.step === 6;
    el.classList.toggle('footer-hidden', footerHidden);

    let html = '';
    if (ui.supportMenuOpen) {
      html += '<div class="floating-support-popover">' +
        '<div style="font-weight:800;color:#7f1d1d;margin-bottom:4px;">' + escHtml(s.teamName) + '</div>' +
        '<div style="font-size:12px;color:#4b5563;margin-bottom:8px;">Đồng chí <strong>' + escHtml(s.officerName) + '</strong> — ' + escHtml(s.teamRole) + '</div>' +
        '<div style="display:flex;flex-direction:column;gap:7px;">' +
        '<a href="tel:' + escHtml(s.phoneTel) + '" class="support-action-link support-action-call" style="justify-content:center;">📞 Gọi trực tiếp: ' + escHtml(s.phoneDisplay) + '</a>' +
        '<a href="' + escHtml(s.zaloUrl) + '" target="_blank" rel="noopener noreferrer" class="support-action-link support-action-zalo" style="justify-content:center;">💬 Nhắn Zalo: ' + escHtml(s.phoneDisplay) + '</a>' +
        '</div>' +
        '</div>';
    }
    html += '<button type="button" class="floating-support-btn" data-action="toggle-support-menu" aria-expanded="' + (ui.supportMenuOpen ? 'true' : 'false') + '">' +
      '<span>📞</span>' +
      '<span>Hỗ trợ: Đ/c Quyền (' + escHtml(s.phoneDisplay) + ')</span>' +
      '</button>';
    el.innerHTML = html;
  }

  // ===== MAIN RENDER =====

  function render() {
    renderHeaderControls();
    const voterView = document.getElementById('voterView');
    const adminView = document.getElementById('adminView');

    if (ui.mode === 'voter') {
      adminView.classList.add('hidden');
      voterView.classList.remove('hidden');

      let html = '';
      if (ui.step <= 5) {
        html += renderStepper();
      }
      if (ui.step === 1) html += renderStep1();
      else if (ui.step === 2) html += renderStep2();
      else if (ui.step === 3) html += renderStep3();
      else if (ui.step === 4) html += renderStep4();
      else if (ui.step === 5) html += renderStep5();
      else if (ui.step === 6) html += renderStep6Success();

      voterView.innerHTML = html;
    } else {
      voterView.classList.add('hidden');
      adminView.classList.remove('hidden');
      adminView.innerHTML = renderAdminView();
    }

    renderWizardFooter();
    renderSiteFooter();
    renderFloatingSupport();
  }

  // ===== EVENT DELEGATION =====

  function setupEvents() {
    document.getElementById('btnToggleMode').addEventListener('click', function () {
      if (ui.mode === 'voter') {
        if (ui.adminUnlocked) {
          ui.mode = 'admin';
          render();
        } else {
          openPinModal();
        }
      } else {
        ui.mode = 'voter';
        render();
      }
    });

    // Global click handler
    document.addEventListener('click', function (ev) {
      // Close combobox when clicking outside
      if (ui.comboOpen && !ev.target.closest('#memberCombobox')) {
        ui.comboOpen = false;
        render();
      }
      // Close floating support popover when clicking outside
      if (ui.supportMenuOpen && !ev.target.closest('#floatingSupport')) {
        ui.supportMenuOpen = false;
        renderFloatingSupport();
      }

      const target = ev.target.closest('[data-action]');
      if (!target) return;
      const action = target.getAttribute('data-action');

      switch (action) {
        case 'toggle-support-menu': {
          ui.supportMenuOpen = !ui.supportMenuOpen;
          renderFloatingSupport();
          break;
        }
        case 'select-branch': {
          const bId = target.getAttribute('data-branch');
          if (bId && bId !== ui.branchId) {
            ui.branchId = bId;
            ui.voterId = '';
            ui.voterRole = 'DANG_VIEN';
            ui.comboOpen = false;
            ui.comboQuery = '';
            initRound1DefaultsForBranch(bId);
            render();
          }
          break;
        }

        case 'toggle-combo': {
          ui.comboOpen = !ui.comboOpen;
          render();
          if (ui.comboOpen) {
            const inp = document.getElementById('comboSearchInput');
            if (inp) inp.focus();
          }
          break;
        }

        case 'pick-member': {
          const mId = target.getAttribute('data-member-id');
          ui.voterId = mId;
          ui.voterRole = Store.getMemberRole(mId);
          ui.comboOpen = false;
          ui.comboQuery = '';
          render();
          break;
        }

        case 'select-role': {
          ui.voterRole = target.getAttribute('data-role');
          render();
          break;
        }

        case 'set-self-rating': {
          ui.selfRating = target.getAttribute('data-rating');
          render();
          break;
        }

        case 'set-committee-rating': {
          ui.committeeRating = target.getAttribute('data-rating');
          render();
          break;
        }

        case 'set-branch-rating': {
          ui.branchRating = target.getAttribute('data-rating');
          render();
          break;
        }

        case 'switch-step4-round': {
          const round = Number(target.getAttribute('data-round'));
          if (round === 2) {
            reconcileRound2WithRound1();
          }
          ui.step4Round = round;
          ui.step4Query = '';
          render();
          window.scrollTo({ top: 0, behavior: 'smooth' });
          break;
        }

        case 'set-r1': {
          const mId = target.getAttribute('data-member-id');
          const rating = target.getAttribute('data-rating');
          ui.round1Votes[mId] = rating;
          if (rating !== 'HTTNV' && ui.round2Htxsnv.has(mId)) {
            ui.round2Htxsnv.delete(mId);
          }
          reconcileRound2WithRound1();
          render();
          break;
        }

        case 'toggle-r2': {
          const mId = target.getAttribute('data-member-id');
          if (ui.round2Htxsnv.has(mId)) {
            ui.round2Htxsnv.delete(mId);
            render();
          } else {
            const info = getMaxHtxsnvForRound2();
            if (ui.round2Htxsnv.size >= info.maxAllowed) {
              showToast('Đã đạt giới hạn tối đa 20% số đảng viên Hoàn thành tốt nhiệm vụ', 3500);
              return;
            }
            ui.round2Htxsnv.add(mId);
            render();
          }
          break;
        }

        case 'prev-step': {
          if (ui.step > 1) {
            ui.step--;
            render();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
          break;
        }

        case 'next-step': {
          if (ui.step === 1) {
            if (!ui.voterId) {
              showToast('Vui lòng chọn Họ và tên của đồng chí.');
              return;
            }
            if (Store.hasVoted(ui.voterId)) {
              showToast('Đảng viên này đã nộp phiếu rồi.');
              return;
            }
          }
          if (ui.step === 3) {
            if (!ui.round1Votes || Object.keys(ui.round1Votes).length === 0) {
              initRound1DefaultsForBranch(ui.branchId);
            }
          }
          if (ui.step === 4) {
            reconcileRound2WithRound1();
          }
          if (ui.step < 5) {
            ui.step++;
            render();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
          break;
        }

        case 'submit-ballot': {
          const members = Store.getBranchMembers(ui.branchId);
          const voter = members.find(function (m) { return m.id === ui.voterId; });
          if (!voter) return;
          if (Store.hasVoted(voter.id)) {
            showToast('Phiếu của đồng chí này đã được nộp trước đó.');
            return;
          }
          reconcileRound2WithRound1();
          const finalMemberVotes = {};
          members.forEach(function (m) {
            const r1 = ui.round1Votes[m.id] || 'HTTNV';
            if (r1 === 'HTTNV' && ui.round2Htxsnv.has(m.id)) {
              finalMemberVotes[m.id] = 'HTXSNV';
            } else {
              finalMemberVotes[m.id] = r1;
            }
          });

          try {
            const receipt = Store.submitBallot({
              branchId: ui.branchId,
              voterId: voter.id,
              voterStt: voter.stt,
              voterName: voter.name,
              voterDisplayName: voter.displayName,
              voterRole: ui.voterRole,
              selfRating: ui.selfRating,
              committeeRating: Store.isCommitteeRole(ui.voterRole) ? ui.committeeRating : null,
              branchRating: ui.branchRating,
              memberVotes: finalMemberVotes
            });
            ui.lastReceipt = receipt;
            ui.step = 6;
            render();
            window.scrollTo({ top: 0, behavior: 'smooth' });
            showToast('Đã nộp phiếu biểu quyết thành công!');
          } catch (err) {
            showToast(err.message || 'Có lỗi xảy ra khi nộp phiếu.');
          }
          break;
        }

        case 'reset-next-voter': {
          resetVoterWizard(true);
          break;
        }

        case 'open-admin-from-success': {
          ui.adminBranchId = ui.branchId;
          if (ui.adminUnlocked) {
            ui.mode = 'admin';
            render();
          } else {
            openPinModal();
          }
          break;
        }

        // Admin actions
        case 'select-admin-branch': {
          ui.adminBranchId = target.getAttribute('data-branch');
          render();
          break;
        }

        case 'switch-admin-tab': {
          ui.adminTab = target.getAttribute('data-tab');
          render();
          break;
        }

        case 'unlock-vote': {
          const mId = target.getAttribute('data-member-id');
          if (global.confirm('Mở khóa cho phép đảng viên này bỏ phiếu lại? Phiếu cũ của đồng chí sẽ bị xóa.')) {
            Store.unlockMemberVote(mId);
            showToast('Đã mở khóa bỏ phiếu lại.');
            render();
          }
          break;
        }

        case 'seed-demo': {
          if (global.confirm('Tạo dữ liệu phiếu mẫu (Demo) cho cả 2 Chi bộ để kiểm thử kiểm phiếu & xuất báo cáo? (Sẽ bổ sung/ghi đè dữ liệu mẫu).')) {
            Store.generateDemoData();
            showToast('Đã tạo dữ liệu mẫu cho Nà Tấu & Phèn Sàng!');
            render();
          }
          break;
        }

        case 'clear-branch-votes': {
          const br = Data.getBranchById(ui.adminBranchId);
          if (global.confirm('Xác nhận xóa TOÀN BỘ phiếu biểu quyết đã nộp của ' + br.name + '? Thao tác này không thể hoàn tác.')) {
            Store.clearBranchVotes(ui.adminBranchId);
            showToast('Đã xóa toàn bộ phiếu của ' + br.name + '.');
            render();
          }
          break;
        }

        case 'export-xlsx': {
          handleExportXlsx();
          break;
        }

        case 'print-a4': {
          if (ui.adminTab === 'progress' || ui.adminTab === 'config') {
            ui.adminTab = 'mau07';
            render();
          }
          setTimeout(function () {
            global.print();
          }, 120);
          break;
        }

        case 'open-qr-modal': {
          ui.qrBranchFilter = ui.adminBranchId;
          openQrModal();
          break;
        }

        case 'set-qr-branch': {
          ui.qrBranchFilter = target.getAttribute('data-branch');
          openQrModal();
          break;
        }

        case 'update-qr-url': {
          const inp = document.getElementById('qrBaseUrlInput');
          if (inp) {
            ui.qrBaseUrl = inp.value.trim().split('?')[0].split('#')[0];
            openQrModal();
          }
          break;
        }

        case 'close-modal': {
          closeModal();
          break;
        }

        case 'save-pin': {
          const inp = document.getElementById('newPinInput');
          if (inp) {
            try {
              Store.setPin(inp.value);
              inp.value = '';
              showToast('Đã cập nhật mã PIN Quản trị mới.');
            } catch (e) {
              showToast(e.message);
            }
          }
          break;
        }

        case 'save-sync-url': {
          const inp = document.getElementById('syncUrlInput');
          if (inp) {
            Store.setSyncUrl(inp.value);
            showToast(inp.value.trim() ? 'Đã lưu cấu hình đồng bộ Cloud.' : 'Đã tắt đồng bộ Cloud.');
            render();
          }
          break;
        }

        case 'export-json': {
          const jsonStr = Store.exportJsonBackup();
          const blob = new Blob([jsonStr], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'phieu_bieu_quyet_muong_lam_2026.json';
          document.body.appendChild(a);
          a.click();
          setTimeout(function () {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }, 400);
          break;
        }
      }
    });

    // Input & Change handlers
    document.addEventListener('input', function (ev) {
      if (ev.target && ev.target.id === 'comboSearchInput') {
        ui.comboQuery = ev.target.value;
        const listEl = document.getElementById('comboListBody');
        if (listEl) {
          listEl.innerHTML = renderComboOptionsHtml(Store.getBranchMembers(ui.branchId));
        }
      } else if (ev.target && ev.target.id === 'step4SearchInput') {
        ui.step4Query = ev.target.value;
        const bodyEl = document.getElementById('step4BodyContainer');
        if (bodyEl) {
          bodyEl.innerHTML = renderStep4BodyHtml();
        }
      }
    });

    document.addEventListener('change', function (ev) {
      const target = ev.target;
      if (!target) return;
      const action = target.getAttribute('data-action');
      if (action === 'change-member-role') {
        const mId = target.getAttribute('data-member-id');
        Store.setMemberRole(mId, target.value);
        showToast('Đã cập nhật chức vụ Chi ủy.');
      } else if (action === 'edit-birthyear') {
        const mId = target.getAttribute('data-member-id');
        Store.setMemberBirthYear(mId, target.value);
        showToast('Đã cập nhật năm sinh hiển thị.');
      } else if (target.id === 'importJsonFile' && target.files && target.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
          try {
            const count = Store.importJsonBackup(e.target.result, true);
            showToast('Đã gộp thành công ' + count + ' phiếu từ tệp JSON!');
            render();
          } catch (err) {
            showToast(err.message || 'Lỗi đọc tệp JSON.');
          }
        };
        reader.readAsText(target.files[0]);
      }
    });

    document.addEventListener('submit', function (ev) {
      if (ev.target && ev.target.id === 'pinForm') {
        ev.preventDefault();
        const inp = document.getElementById('pinInput');
        const err = document.getElementById('pinError');
        if (inp && Store.verifyPin(inp.value)) {
          ui.adminUnlocked = true;
          ui.mode = 'admin';
          closeModal();
          render();
        } else if (err) {
          err.classList.remove('hidden');
          if (inp) inp.select();
        }
      }
    });
  }

  function syncFavicon() {
    const link = document.getElementById('appFavicon');
    if (!link) return;
    const probe = new Image();
    probe.onload = function () {
      link.href = LOGO_PRIMARY;
    };
    probe.onerror = function () {
      link.href = LOGO_FALLBACK;
    };
    probe.src = LOGO_PRIMARY;
  }

  function bootstrap() {
    syncFavicon();
    // Parse URL params (?branch=na-tau or ?branch=phen-sang)
    try {
      const params = new URLSearchParams(window.location.search);
      const branchParam = params.get('branch');
      if (branchParam === 'na-tau' || branchParam === 'phen-sang') {
        ui.branchId = branchParam;
        ui.adminBranchId = branchParam;
      }
    } catch (e) {}

    initRound1DefaultsForBranch(ui.branchId);
    setupEvents();

    // Real-time sync listener
    Store.subscribe(function () {
      // Only re-render automatically when in admin view or step 1/6 to avoid disrupting mid-input typing
      if (ui.mode === 'admin' || ui.step === 1 || ui.step === 6) {
        if (!ui.comboOpen) render();
      } else {
        renderHeaderControls();
      }
    });

    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})(window);
