/**
 * Store, Real-time Sync & Counting Engine
 * Đảng bộ xã Mường Lầm, tỉnh Sơn La - Năm 2026
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'muong_lam_danh_gia_2026_v1';
  const CHANNEL_NAME = 'muong_lam_2026_channel';

  const listeners = new Set();
  let channel = null;
  let syncTimer = null;

  function buildInitialState() {
    const roleConfig = {};
    global.AppData.BRANCHES.forEach(function (branch) {
      branch.members.forEach(function (m) {
        roleConfig[m.id] = m.defaultRole || 'DANG_VIEN';
      });
    });
    return {
      pin: global.AppData.DOC_META.defaultPin,
      syncUrl: '',
      roleConfig: roleConfig,
      birthYearOverrides: {},
      ballots: {},
      updatedAt: new Date().toISOString()
    };
  }

  function loadState() {
    const base = buildInitialState();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return base;
      const parsed = JSON.parse(raw);
      return {
        pin: parsed.pin || base.pin,
        syncUrl: parsed.syncUrl || '',
        roleConfig: Object.assign({}, base.roleConfig, parsed.roleConfig || {}),
        birthYearOverrides: Object.assign({}, parsed.birthYearOverrides || {}),
        ballots: parsed.ballots || {},
        updatedAt: parsed.updatedAt || base.updatedAt
      };
    } catch (e) {
      return base;
    }
  }

  let state = loadState();

  function saveState(broadcast) {
    state.updatedAt = new Date().toISOString();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      // Ignore quota errors in restricted environments
    }
    if (broadcast !== false && channel) {
      try {
        channel.postMessage({ type: 'STATE_SYNC', state: state });
      } catch (e) {}
    }
    notify();
  }

  function notify() {
    listeners.forEach(function (fn) {
      try { fn(state); } catch (e) {}
    });
  }

  function initSync() {
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        channel = new BroadcastChannel(CHANNEL_NAME);
        channel.onmessage = function (ev) {
          if (ev && ev.data && ev.data.type === 'STATE_SYNC' && ev.data.state) {
            state = ev.data.state;
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
            notify();
          }
        };
      } catch (e) {}
    }

    global.addEventListener('storage', function (ev) {
      if (ev.key === STORAGE_KEY && ev.newValue) {
        try {
          state = JSON.parse(ev.newValue);
          notify();
        } catch (e) {}
      }
    });

    if (state.syncUrl) {
      startCloudPolling();
    }
  }

  function subscribe(fn) {
    listeners.add(fn);
    return function () { listeners.delete(fn); };
  }

  function getState() {
    return state;
  }

  function getMemberRole(memberId) {
    return state.roleConfig[memberId] || 'DANG_VIEN';
  }

  function isCommitteeRole(roleCode) {
    return roleCode === 'BI_THU' || roleCode === 'PHO_BI_THU' || roleCode === 'CHI_UY_VIEN';
  }

  function getBranchMembers(branchId) {
    const branch = global.AppData.getBranchById(branchId);
    return branch.members.map(function (m) {
      const birthYear = state.birthYearOverrides[m.id] !== undefined
        ? state.birthYearOverrides[m.id]
        : m.birthYear;
      const role = getMemberRole(m.id);
      const displayName = birthYear
        ? m.stt + '. ' + m.name + ' - ' + birthYear
        : m.stt + '. ' + m.name;
      return Object.assign({}, m, {
        birthYear: birthYear || '',
        role: role,
        roleMeta: global.AppData.getRoleMeta(role),
        displayName: displayName
      });
    });
  }

  function setMemberRole(memberId, roleCode) {
    state.roleConfig[memberId] = roleCode;
    saveState(true);
    pushConfigToCloud();
  }

  function setMemberBirthYear(memberId, birthYear) {
    state.birthYearOverrides[memberId] = String(birthYear || '').trim();
    saveState(true);
  }

  function hasVoted(memberId) {
    return Boolean(state.ballots && state.ballots[memberId]);
  }

  function getBallot(memberId) {
    return (state.ballots && state.ballots[memberId]) || null;
  }

  function submitBallot(ballot) {
    if (!ballot || !ballot.voterId) throw new Error('Thiếu thông tin người bỏ phiếu');
    if (state.ballots[ballot.voterId]) {
      throw new Error('Đảng viên này đã nộp phiếu biểu quyết rồi.');
    }
    const receiptCode = 'ML26-' + String(ballot.voterStt).padStart(2, '0') + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
    const record = Object.assign({}, ballot, {
      id: receiptCode,
      submittedAt: new Date().toISOString()
    });
    state.ballots[ballot.voterId] = record;
    saveState(true);
    pushBallotToCloud(record);
    return record;
  }

  function unlockMemberVote(memberId) {
    if (state.ballots && state.ballots[memberId]) {
      delete state.ballots[memberId];
      saveState(true);
      deleteBallotFromCloud(memberId);
      return true;
    }
    return false;
  }

  function clearBranchVotes(branchId) {
    if (!branchId) {
      state.ballots = {};
    } else {
      Object.keys(state.ballots).forEach(function (k) {
        if (state.ballots[k] && state.ballots[k].branchId === branchId) {
          delete state.ballots[k];
        }
      });
    }
    saveState(true);
    if (state.syncUrl) pushFullStateToCloud();
  }

  function setPin(newPin) {
    const clean = String(newPin || '').trim();
    if (clean.length < 4) throw new Error('Mã PIN phải có ít nhất 4 ký tự.');
    state.pin = clean;
    saveState(true);
  }

  function verifyPin(inputPin) {
    return String(inputPin || '').trim() === String(state.pin || '2026');
  }

  // Optional Firebase RTDB / REST sync
  function normalizeSyncBase(url) {
    const u = String(url || '').trim().replace(/\/+$/, '');
    if (!u) return '';
    return u.endsWith('.json') ? u.slice(0, -5) : u;
  }

  function setSyncUrl(url) {
    state.syncUrl = normalizeSyncBase(url);
    saveState(true);
    if (syncTimer) {
      clearInterval(syncTimer);
      syncTimer = null;
    }
    if (state.syncUrl) {
      pullFromCloud();
      startCloudPolling();
    }
  }

  function startCloudPolling() {
    if (syncTimer) clearInterval(syncTimer);
    if (!state.syncUrl) return;
    syncTimer = setInterval(function () {
      pullFromCloud();
    }, 6000);
  }

  function pushBallotToCloud(record) {
    if (!state.syncUrl || typeof fetch !== 'function') return;
    fetch(state.syncUrl + '/ballots/' + encodeURIComponent(record.voterId) + '.json', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record)
    }).catch(function () {});
  }

  function deleteBallotFromCloud(memberId) {
    if (!state.syncUrl || typeof fetch !== 'function') return;
    fetch(state.syncUrl + '/ballots/' + encodeURIComponent(memberId) + '.json', {
      method: 'DELETE'
    }).catch(function () {});
  }

  function pushConfigToCloud() {
    if (!state.syncUrl || typeof fetch !== 'function') return;
    fetch(state.syncUrl + '/roleConfig.json', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.roleConfig)
    }).catch(function () {});
  }

  function pushFullStateToCloud() {
    if (!state.syncUrl || typeof fetch !== 'function') return;
    fetch(state.syncUrl + '.json', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roleConfig: state.roleConfig,
        ballots: state.ballots,
        updatedAt: state.updatedAt
      })
    }).catch(function () {});
  }

  function pullFromCloud() {
    if (!state.syncUrl || typeof fetch !== 'function') return Promise.resolve(false);
    return fetch(state.syncUrl + '.json')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || typeof data !== 'object') return false;
        let changed = false;
        if (data.ballots && typeof data.ballots === 'object') {
          state.ballots = Object.assign({}, data.ballots);
          changed = true;
        }
        if (data.roleConfig && typeof data.roleConfig === 'object') {
          state.roleConfig = Object.assign({}, state.roleConfig, data.roleConfig);
          changed = true;
        }
        if (changed) saveState(true);
        return changed;
      })
      .catch(function () { return false; });
  }

  function exportJsonBackup() {
    return JSON.stringify({
      app: 'MuongLamDanhGia2026',
      exportedAt: new Date().toISOString(),
      roleConfig: state.roleConfig,
      birthYearOverrides: state.birthYearOverrides,
      ballots: state.ballots
    }, null, 2);
  }

  function importJsonBackup(jsonText, mergeOnly) {
    const parsed = JSON.parse(jsonText);
    if (!parsed || typeof parsed !== 'object' || !parsed.ballots) {
      throw new Error('Tệp JSON không hợp lệ hoặc không đúng định dạng phiếu biểu quyết.');
    }
    if (mergeOnly) {
      state.ballots = Object.assign({}, state.ballots, parsed.ballots);
      if (parsed.roleConfig) {
        state.roleConfig = Object.assign({}, state.roleConfig, parsed.roleConfig);
      }
    } else {
      state.ballots = parsed.ballots;
      if (parsed.roleConfig) state.roleConfig = Object.assign({}, state.roleConfig, parsed.roleConfig);
      if (parsed.birthYearOverrides) state.birthYearOverrides = Object.assign({}, parsed.birthYearOverrides);
    }
    saveState(true);
    return Object.keys(parsed.ballots).length;
  }

  // Generate realistic demo ballots for testing
  function generateDemoData(branchId) {
    const branches = branchId ? [global.AppData.getBranchById(branchId)] : global.AppData.BRANCHES;
    branches.forEach(function (branch) {
      const members = getBranchMembers(branch.id);
      // Ensure Nà Tấu also has a demo Chi ủy if none set
      if (branch.id === 'na-tau') {
        const hasComm = members.some(function (m) { return isCommitteeRole(m.role); });
        if (!hasComm) {
          state.roleConfig['na-tau-1'] = 'BI_THU';
          state.roleConfig['na-tau-2'] = 'PHO_BI_THU';
          state.roleConfig['na-tau-3'] = 'CHI_UY_VIEN';
        }
      }

      const refreshed = getBranchMembers(branch.id);
      const maxHtxsnv = Math.floor(refreshed.length * 0.2);

      // Simulate ~85% turnout for realistic progress view (leaving a few unvoted)
      const voterCount = branch.id === 'na-tau' ? 22 : 44;

      // Pick deterministic top candidates so rankings look realistic
      const topIndices = [];
      for (let k = 0; k < Math.min(maxHtxsnv + 3, refreshed.length); k++) {
        topIndices.push(k);
      }

      for (let i = 0; i < voterCount; i++) {
        const voter = refreshed[i];
        const memberVotes = {};

        // Round 1: mostly HTTNV, a couple HTNV
        refreshed.forEach(function (target, idx) {
          if (idx === refreshed.length - 1 && i % 3 === 0) {
            memberVotes[target.id] = 'HTNV';
          } else if (idx === refreshed.length - 2 && i % 4 === 0) {
            memberVotes[target.id] = 'HTNV';
          } else {
            memberVotes[target.id] = 'HTTNV';
          }
        });

        // Round 2: elect up to maxHtxsnv (<= 20% of HTTNV)
        const httnvTargets = refreshed.filter(function (t) { return memberVotes[t.id] === 'HTTNV'; });
        const cap = Math.floor(httnvTargets.length * 0.2);
        let picked = 0;
        for (let t = 0; t < httnvTargets.length && picked < cap; t++) {
          const candidate = httnvTargets[t];
          // Give top candidates high votes, rotate a bit for realism
          if (t < cap - 1 || (t === cap - 1 + (i % 3))) {
            memberVotes[candidate.id] = 'HTXSNV';
            picked++;
          }
        }

        const selfRating = i < maxHtxsnv ? 'HTXSNV' : (i === voterCount - 1 ? 'HTNV' : 'HTTNV');
        const isComm = isCommitteeRole(voter.role);
        const branchRating = i % 7 === 0 ? 'HTXSNV' : 'HTTNV';
        const committeeRating = isComm ? (i % 2 === 0 ? 'HTXSNV' : 'HTTNV') : null;

        state.ballots[voter.id] = {
          id: 'DEMO-' + String(voter.stt).padStart(2, '0'),
          branchId: branch.id,
          voterId: voter.id,
          voterStt: voter.stt,
          voterName: voter.name,
          voterDisplayName: voter.displayName,
          voterRole: voter.role,
          selfRating: selfRating,
          committeeRating: committeeRating,
          branchRating: branchRating,
          memberVotes: memberVotes,
          submittedAt: new Date(Date.now() - (voterCount - i) * 60000).toISOString()
        };
      }
    });
    saveState(true);
  }

  function pct(count, total) {
    if (!total) return 0;
    return Math.round((count / total) * 1000) / 10;
  }

  function emptyCounts() {
    return { HTXSNV: 0, HTTNV: 0, HTNV: 0, KHTNV: 0 };
  }

  function computeMajorityRating(counts, total) {
    if (!total) return null;
    const order = ['HTXSNV', 'HTTNV', 'HTNV', 'KHTNV'];
    let best = 'HTTNV';
    let bestVal = -1;
    order.forEach(function (code) {
      if (counts[code] > bestVal) {
        bestVal = counts[code];
        best = code;
      }
    });
    return best;
  }

  /**
   * Tổng hợp đầy đủ các biểu mẫu theo Hướng dẫn số 02-HD/BTCTU
   */
  function computeBranchReport(branchId) {
    const branch = global.AppData.getBranchById(branchId);
    const members = getBranchMembers(branchId);
    const allBallots = Object.values(state.ballots || {}).filter(function (b) {
      return b && b.branchId === branchId;
    });

    allBallots.sort(function (a, b) { return a.voterStt - b.voterStt; });

    const votedIds = new Set(allBallots.map(function (b) { return b.voterId; }));
    const votedMembers = members.filter(function (m) { return votedIds.has(m.id); });
    const unvotedMembers = members.filter(function (m) { return !votedIds.has(m.id); });

    // Mẫu 3a & 3a1: Tổng hợp xếp loại Chi bộ (toàn thể đảng viên)
    const branchCounts = emptyCounts();
    allBallots.forEach(function (b) {
      if (b.branchRating && branchCounts[b.branchRating] !== undefined) {
        branchCounts[b.branchRating]++;
      }
    });
    const branchTotalVotes = allBallots.length;
    const branchProposed = computeMajorityRating(branchCounts, branchTotalVotes);

    // Mẫu 3a2: Tổng hợp xếp loại Chi ủy Chi bộ (chỉ tính phiếu Ban Chi ủy)
    const committeeMembers = members.filter(function (m) { return isCommitteeRole(m.role); });
    const committeeBallots = allBallots.filter(function (b) {
      return isCommitteeRole(b.voterRole) && b.committeeRating;
    });
    const committeeCounts = emptyCounts();
    committeeBallots.forEach(function (b) {
      if (committeeCounts[b.committeeRating] !== undefined) {
        committeeCounts[b.committeeRating]++;
      }
    });
    const committeeTotalVotes = committeeBallots.length;
    const committeeProposed = computeMajorityRating(committeeCounts, committeeTotalVotes);

    // Mẫu 07 & 3a4: Tổng hợp biểu quyết từng đảng viên
    const memberRows = members.map(function (m) {
      const counts = emptyCounts();
      allBallots.forEach(function (b) {
        const v = b.memberVotes && b.memberVotes[m.id];
        if (v && counts[v] !== undefined) {
          counts[v]++;
        }
      });

      const total = allBallots.length;
      const ownBallot = state.ballots[m.id] || null;
      const selfRating = ownBallot ? ownBallot.selfRating : null;

      // Xác định mức cơ sở (trước khi xét trần 20% HTXSNV)
      let baseLevel = null;
      if (total > 0) {
        const goodOrAbove = counts.HTXSNV + counts.HTTNV;
        if (counts.KHTNV > total / 2 || (counts.KHTNV > goodOrAbove && counts.KHTNV >= counts.HTNV && counts.KHTNV > 0)) {
          baseLevel = 'KHTNV';
        } else if (counts.HTNV > total / 2 || (counts.HTNV > goodOrAbove && counts.HTNV > 0)) {
          baseLevel = 'HTNV';
        } else {
          baseLevel = 'HTTNV';
        }
      }

      return {
        member: m,
        selfRating: selfRating,
        hasVoted: Boolean(ownBallot),
        counts: counts,
        totalVotes: total,
        pct: {
          HTXSNV: pct(counts.HTXSNV, total),
          HTTNV: pct(counts.HTTNV, total),
          HTNV: pct(counts.HTNV, total),
          KHTNV: pct(counts.KHTNV, total)
        },
        baseLevel: baseLevel,
        proposedRating: baseLevel,
        isProposedHTXSNV: false,
        htxsnvRank: null
      };
    });

    // Áp dụng quy định trần tối đa 20% HTXSNV trên số đạt HTTNV trở lên
    const httnvEligible = memberRows.filter(function (r) { return r.baseLevel === 'HTTNV'; });
    const maxHtxsnvSeats = Math.floor(httnvEligible.length * 0.2);

    const rankedForHtxsnv = httnvEligible
      .filter(function (r) { return r.counts.HTXSNV > 0; })
      .slice()
      .sort(function (a, b) {
        if (b.counts.HTXSNV !== a.counts.HTXSNV) return b.counts.HTXSNV - a.counts.HTXSNV;
        const bGood = b.counts.HTXSNV + b.counts.HTTNV;
        const aGood = a.counts.HTXSNV + a.counts.HTTNV;
        if (bGood !== aGood) return bGood - aGood;
        return a.member.stt - b.member.stt;
      });

    rankedForHtxsnv.forEach(function (row, idx) {
      row.htxsnvRank = idx + 1;
      if (idx < maxHtxsnvSeats) {
        row.proposedRating = 'HTXSNV';
        row.isProposedHTXSNV = true;
      }
    });

    // Mẫu 07 sắp xếp theo số phiếu HTXSNV cao nhất từ trên xuống dưới
    const mau07Rows = memberRows.slice().sort(function (a, b) {
      if (b.counts.HTXSNV !== a.counts.HTXSNV) return b.counts.HTXSNV - a.counts.HTXSNV;
      if (b.counts.HTTNV !== a.counts.HTTNV) return b.counts.HTTNV - a.counts.HTTNV;
      return a.member.stt - b.member.stt;
    });

    // Mẫu 3a3: Bí thư, Phó Bí thư, Chi ủy viên
    const mau3a3Rows = memberRows
      .filter(function (r) { return isCommitteeRole(r.member.role); })
      .sort(function (a, b) {
        if (a.member.roleMeta.order !== b.member.roleMeta.order) {
          return a.member.roleMeta.order - b.member.roleMeta.order;
        }
        return a.member.stt - b.member.stt;
      });

    // Thống kê kết quả đề xuất đảng viên
    const summaryProposed = emptyCounts();
    memberRows.forEach(function (r) {
      if (r.proposedRating && summaryProposed[r.proposedRating] !== undefined) {
        summaryProposed[r.proposedRating]++;
      }
    });

    return {
      branch: branch,
      members: members,
      totalMembers: members.length,
      votedCount: allBallots.length,
      progressPct: pct(allBallots.length, members.length),
      ballots: allBallots,
      votedMembers: votedMembers,
      unvotedMembers: unvotedMembers,
      branchSummary: {
        totalVotes: branchTotalVotes,
        counts: branchCounts,
        pct: {
          HTXSNV: pct(branchCounts.HTXSNV, branchTotalVotes),
          HTTNV: pct(branchCounts.HTTNV, branchTotalVotes),
          HTNV: pct(branchCounts.HTNV, branchTotalVotes),
          KHTNV: pct(branchCounts.KHTNV, branchTotalVotes)
        },
        proposed: branchProposed
      },
      committeeSummary: {
        configuredCount: committeeMembers.length,
        totalVotes: committeeTotalVotes,
        counts: committeeCounts,
        pct: {
          HTXSNV: pct(committeeCounts.HTXSNV, committeeTotalVotes),
          HTTNV: pct(committeeCounts.HTTNV, committeeTotalVotes),
          HTNV: pct(committeeCounts.HTNV, committeeTotalVotes),
          KHTNV: pct(committeeCounts.KHTNV, committeeTotalVotes)
        },
        proposed: committeeProposed
      },
      httnvEligibleCount: httnvEligible.length,
      maxHtxsnvSeats: maxHtxsnvSeats,
      proposedHtxsnvCount: rankedForHtxsnv.filter(function (r) { return r.isProposedHTXSNV; }).length,
      summaryProposed: summaryProposed,
      mau07Rows: mau07Rows,
      mau3a3Rows: mau3a3Rows,
      mau3a4Rows: memberRows
    };
  }

  initSync();

  global.AppStore = {
    subscribe: subscribe,
    getState: getState,
    getMemberRole: getMemberRole,
    isCommitteeRole: isCommitteeRole,
    getBranchMembers: getBranchMembers,
    setMemberRole: setMemberRole,
    setMemberBirthYear: setMemberBirthYear,
    hasVoted: hasVoted,
    getBallot: getBallot,
    submitBallot: submitBallot,
    unlockMemberVote: unlockMemberVote,
    clearBranchVotes: clearBranchVotes,
    setPin: setPin,
    verifyPin: verifyPin,
    setSyncUrl: setSyncUrl,
    pullFromCloud: pullFromCloud,
    exportJsonBackup: exportJsonBackup,
    importJsonBackup: importJsonBackup,
    generateDemoData: generateDemoData,
    computeBranchReport: computeBranchReport
  };
})(window);
