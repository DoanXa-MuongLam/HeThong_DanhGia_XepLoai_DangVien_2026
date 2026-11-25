/**
 * Dữ liệu danh sách đảng viên & cấu hình nghiệp vụ
 * Đảng bộ xã Mường Lầm, tỉnh Sơn La - Năm 2026
 * Căn cứ Hướng dẫn số 02-HD/BTCTU ngày 20/11/2025 của Ban Tổ chức Tỉnh ủy
 */
(function (global) {
  'use strict';

  const RATINGS = [
    {
      code: 'HTXSNV',
      label: 'Hoàn thành xuất sắc nhiệm vụ',
      shortLabel: 'HTXSNV',
      badgeClass: 'rating-htxsnv',
      order: 1
    },
    {
      code: 'HTTNV',
      label: 'Hoàn thành tốt nhiệm vụ',
      shortLabel: 'HTTNV',
      badgeClass: 'rating-httnv',
      order: 2
    },
    {
      code: 'HTNV',
      label: 'Hoàn thành nhiệm vụ',
      shortLabel: 'HTNV',
      badgeClass: 'rating-htnv',
      order: 3
    },
    {
      code: 'KHTNV',
      label: 'Không hoàn thành nhiệm vụ',
      shortLabel: 'KHTNV',
      badgeClass: 'rating-khtnv',
      order: 4
    }
  ];

  const ROLES = [
    { code: 'BI_THU', label: 'Bí thư', isCommittee: true, order: 1 },
    { code: 'PHO_BI_THU', label: 'Phó Bí thư', isCommittee: true, order: 2 },
    { code: 'CHI_UY_VIEN', label: 'Chi ủy viên', isCommittee: true, order: 3 },
    { code: 'DANG_VIEN', label: 'Đảng viên', isCommittee: false, order: 4 }
  ];

  const BRANCHES = [
    {
      id: 'na-tau',
      name: 'Chi bộ bản Nà Tấu',
      shortName: 'Bản Nà Tấu',
      partyCommittee: 'Đảng ủy xã Mường Lầm',
      province: 'Tỉnh Sơn La',
      members: [
        { stt: 1, name: 'Lò Văn Liên', defaultRole: 'DANG_VIEN' },
        { stt: 2, name: 'Lò Văn Khởi', defaultRole: 'DANG_VIEN' },
        { stt: 3, name: 'Lò Văn Quý', defaultRole: 'DANG_VIEN' },
        { stt: 4, name: 'Lò Văn Xuân', defaultRole: 'DANG_VIEN' },
        { stt: 5, name: 'Lò Văn Tiên', defaultRole: 'DANG_VIEN' },
        { stt: 6, name: 'Vàng A Vự', defaultRole: 'DANG_VIEN' },
        { stt: 7, name: 'Vàng A Dạy', defaultRole: 'DANG_VIEN' },
        { stt: 8, name: 'Vàng A Thái', defaultRole: 'DANG_VIEN' },
        { stt: 9, name: 'Mòng Văn Nghị', defaultRole: 'DANG_VIEN' },
        { stt: 10, name: 'Lò Văn Vặt', defaultRole: 'DANG_VIEN' },
        { stt: 11, name: 'Vàng A Phử', defaultRole: 'DANG_VIEN' },
        { stt: 12, name: 'Lò Văn Chực', defaultRole: 'DANG_VIEN' },
        { stt: 13, name: 'Vừ A Phổng', defaultRole: 'DANG_VIEN' },
        { stt: 14, name: 'Mùa A Của', defaultRole: 'DANG_VIEN' },
        { stt: 15, name: 'Vừ A Kông', defaultRole: 'DANG_VIEN' },
        { stt: 16, name: 'Vừ A Pó', defaultRole: 'DANG_VIEN' },
        { stt: 17, name: 'Vừ A Lậu', defaultRole: 'DANG_VIEN' },
        { stt: 18, name: 'Vừ A Cha', defaultRole: 'DANG_VIEN' },
        { stt: 19, name: 'Vừ A Chống', defaultRole: 'DANG_VIEN' },
        { stt: 20, name: 'Vừ A Tiến', defaultRole: 'DANG_VIEN' },
        { stt: 21, name: 'Sộng Bả Động', defaultRole: 'DANG_VIEN' },
        { stt: 22, name: 'Sộng A May', defaultRole: 'DANG_VIEN' },
        { stt: 23, name: 'Sộng Vả Phia', defaultRole: 'DANG_VIEN' },
        { stt: 24, name: 'Vàng A Dếnh', defaultRole: 'DANG_VIEN' },
        { stt: 25, name: 'Vàng A Lệnh', defaultRole: 'DANG_VIEN' },
        { stt: 26, name: 'Sộng A Công', defaultRole: 'DANG_VIEN' }
      ]
    },
    {
      id: 'phen-sang',
      name: 'Chi bộ bản Phèn Sàng',
      shortName: 'Bản Phèn Sàng',
      partyCommittee: 'Đảng ủy xã Mường Lầm',
      province: 'Tỉnh Sơn La',
      members: [
        { stt: 1, name: 'Cà Văn Trực', defaultRole: 'BI_THU' },
        { stt: 2, name: 'Lường Văn Thịnh', defaultRole: 'DANG_VIEN' },
        { stt: 3, name: 'Cà Văn Thích', defaultRole: 'DANG_VIEN' },
        { stt: 4, name: 'Cà Văn Ngoãn', defaultRole: 'DANG_VIEN' },
        { stt: 5, name: 'Lường Thị Phanh', defaultRole: 'DANG_VIEN' },
        { stt: 6, name: 'Hà Thị Diện', defaultRole: 'DANG_VIEN' },
        { stt: 7, name: 'Tòng Văn Phong', defaultRole: 'DANG_VIEN' },
        { stt: 8, name: 'Cà Văn Luyến', defaultRole: 'DANG_VIEN' },
        { stt: 9, name: 'Lường Văn Hồng', defaultRole: 'DANG_VIEN' },
        { stt: 10, name: 'Hà Đình Chu', defaultRole: 'DANG_VIEN' },
        { stt: 11, name: 'Cà Văn Tịch', defaultRole: 'DANG_VIEN' },
        { stt: 12, name: 'Lường Văn Thạch', defaultRole: 'DANG_VIEN' },
        { stt: 13, name: 'Quàng Văn Hoa', birthYear: '1980', note: 'Trùng tên #13', defaultRole: 'DANG_VIEN' },
        { stt: 14, name: 'Hà Văn Nguyễn', defaultRole: 'DANG_VIEN' },
        { stt: 15, name: 'Lò Thị Thơm', defaultRole: 'DANG_VIEN' },
        { stt: 16, name: 'Cà Văn Thiên', defaultRole: 'DANG_VIEN' },
        { stt: 17, name: 'Cà Văn Thái', defaultRole: 'DANG_VIEN' },
        { stt: 18, name: 'Lường Thị Tưởng', defaultRole: 'DANG_VIEN' },
        { stt: 19, name: 'Cà Văn Tiến', defaultRole: 'DANG_VIEN' },
        { stt: 20, name: 'Cà Văn Kiển', defaultRole: 'DANG_VIEN' },
        { stt: 21, name: 'Cà Văn Doan', defaultRole: 'DANG_VIEN' },
        { stt: 22, name: 'Cầm Pha Viêng', defaultRole: 'DANG_VIEN' },
        { stt: 23, name: 'Lường Văn Hùng', defaultRole: 'DANG_VIEN' },
        { stt: 24, name: 'Lường Văn Chỉnh', defaultRole: 'DANG_VIEN' },
        { stt: 25, name: 'Lò Thị Liến', defaultRole: 'DANG_VIEN' },
        { stt: 26, name: 'Quàng Văn Thiết', defaultRole: 'PHO_BI_THU' },
        { stt: 27, name: 'Quàng Văn Kiểm', defaultRole: 'DANG_VIEN' },
        { stt: 28, name: 'Quàng Văn Hoa', birthYear: '1970', note: 'Trùng tên #28', defaultRole: 'DANG_VIEN' },
        { stt: 29, name: 'Quàng Văn Soái', defaultRole: 'DANG_VIEN' },
        { stt: 30, name: 'Quàng Thị Phước', defaultRole: 'DANG_VIEN' },
        { stt: 31, name: 'Quàng Thị Sính', defaultRole: 'DANG_VIEN' },
        { stt: 32, name: 'Quàng Văn Phiện', defaultRole: 'DANG_VIEN' },
        { stt: 33, name: 'Quàng Văn Tim', defaultRole: 'DANG_VIEN' },
        { stt: 34, name: 'Quàng Văn Chiển', defaultRole: 'DANG_VIEN' },
        { stt: 35, name: 'Quàng Văn Trinh', defaultRole: 'DANG_VIEN' },
        { stt: 36, name: 'Quàng Văn Liên', defaultRole: 'DANG_VIEN' },
        { stt: 37, name: 'Quàng Văn Cường', defaultRole: 'DANG_VIEN' },
        { stt: 38, name: 'Quàng Văn Lập', defaultRole: 'DANG_VIEN' },
        { stt: 39, name: 'Quàng Văn Vân', defaultRole: 'DANG_VIEN' },
        { stt: 40, name: 'Quàng Văn Thuân', defaultRole: 'DANG_VIEN' },
        { stt: 41, name: 'Quàng Văn Đông', defaultRole: 'DANG_VIEN' },
        { stt: 42, name: 'Quàng Văn Nhẫn', defaultRole: 'DANG_VIEN' },
        { stt: 43, name: 'Quàng Văn Tiến', defaultRole: 'DANG_VIEN' },
        { stt: 44, name: 'Lường Thị Thiệp', defaultRole: 'DANG_VIEN' },
        { stt: 45, name: 'Hà Ngọc Sơn', defaultRole: 'DANG_VIEN' },
        { stt: 46, name: 'Lường Thị Định', defaultRole: 'DANG_VIEN' },
        { stt: 47, name: 'Lò Văn Tươi', defaultRole: 'DANG_VIEN' },
        { stt: 48, name: 'Quàng Văn Công', defaultRole: 'DANG_VIEN' },
        { stt: 49, name: 'Lường Thị Thu', defaultRole: 'DANG_VIEN' },
        { stt: 50, name: 'Quàng Văn Tích', defaultRole: 'DANG_VIEN' },
        { stt: 51, name: 'Cà Thùy Dương', defaultRole: 'DANG_VIEN' },
        { stt: 52, name: 'Tòng Trọng Lực', defaultRole: 'DANG_VIEN' }
      ]
    }
  ];

  // Chuẩn hóa ID & displayName cho mỗi đảng viên
  BRANCHES.forEach(function (branch) {
    branch.members = branch.members.map(function (m) {
      const id = branch.id + '-' + m.stt;
      const displayName = m.birthYear
        ? m.stt + '. ' + m.name + ' - ' + m.birthYear
        : m.stt + '. ' + m.name;
      return Object.assign({}, m, {
        id: id,
        branchId: branch.id,
        displayName: displayName
      });
    });
  });

  const DOC_META = {
    year: 2026,
    guidanceRef: 'Hướng dẫn số 02-HD/BTCTU ngày 20/11/2025 của Ban Tổ chức Tỉnh ủy Sơn La',
    reportDateText: 'Mường Lầm, ngày 25 tháng 11 năm 2026',
    reportDateShort: '25/11/2026',
    partyName: 'ĐẢNG CỘNG SẢN VIỆT NAM',
    upperCommittee: 'ĐẢNG BỘ XÃ MƯỜNG LẦM',
    provinceName: 'TỈNH SƠN LA',
    defaultPin: '2026'
  };

  const SUPPORT_INFO = {
    teamName: 'Đoàn công tác số 07 - Đảng ủy xã Mường Lầm',
    decisionRef: 'Quyết định số 417-QĐ/ĐU ngày 19/11/2026 của Ban Thường vụ Đảng ủy xã Mường Lầm',
    scopeNote: 'Mục VII - Đoàn công tác số 07 phụ trách Chi bộ Phèn Sàng và Chi bộ bản Nà Tấu',
    officerName: 'Lò Mạnh Quyền',
    officerTitle: 'Ủy viên BCH Đảng bộ, Phó Chủ tịch Ủy ban MTTQVN xã, Bí thư Đoàn xã',
    teamRole: 'Phó Trưởng đoàn kiêm Thư ký Đoàn công tác số 07',
    phoneDisplay: '0354.442.054',
    phoneTel: '0354442054',
    zaloUrl: 'https://zalo.me/0354442054'
  };

  function getRatingMeta(code) {
    return RATINGS.find(function (r) { return r.code === code; }) || RATINGS[1];
  }

  function getRoleMeta(code) {
    return ROLES.find(function (r) { return r.code === code; }) || ROLES[3];
  }

  function getBranchById(branchId) {
    return BRANCHES.find(function (b) { return b.id === branchId; }) || BRANCHES[0];
  }

  function normalizeVietnamese(str) {
    return String(str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .trim();
  }

  global.AppData = {
    RATINGS: RATINGS,
    ROLES: ROLES,
    BRANCHES: BRANCHES,
    DOC_META: DOC_META,
    SUPPORT_INFO: SUPPORT_INFO,
    getRatingMeta: getRatingMeta,
    getRoleMeta: getRoleMeta,
    getBranchById: getBranchById,
    normalizeVietnamese: normalizeVietnamese
  };
})(window);
