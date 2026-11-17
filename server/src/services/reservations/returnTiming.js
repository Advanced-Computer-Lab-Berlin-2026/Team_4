// Reservation dates use UTC midnight. A return at the deadline itself is on time.
function isLateReturn(returnedAt, endDate) {
  return returnedAt != null && endDate != null && +new Date(returnedAt) > +new Date(endDate);
}

function lifecycleFlags(reservation, now = new Date()) {
  return {
    approvalOverdue: reservation.status === 'pending' && now >= reservation.startDate,
    pickupMissed: reservation.status === 'confirmed' && !reservation.pickedUpAt && now >= reservation.endDate,
    returnOverdue: reservation.status === 'active' && isLateReturn(now, reservation.endDate),
    extensionStatus: reservation.extension?.status === 'pending' && now >= reservation.endDate
      ? 'expired' : (reservation.extension?.status ?? 'none'),
  };
}

module.exports = { isLateReturn, lifecycleFlags };
