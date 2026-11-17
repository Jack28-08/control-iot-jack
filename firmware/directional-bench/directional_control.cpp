#include "directional_control.h"

namespace node01 {
namespace {

constexpr std::uint8_t left = 0x01;
constexpr std::uint8_t forward = 0x02;
constexpr std::uint8_t reverse = 0x10;
constexpr std::uint8_t right = 0x80;
// Bench ceiling. Choose the production deadline from hardware measurements.
constexpr std::uint32_t maxBenchTtlMs = 1000;

bool validAxis(int axis) {
    return axis >= -1 && axis <= 1;
}

std::uint8_t axisMask(int value, std::uint8_t negative, std::uint8_t positive) {
    if (value < 0) return negative;
    if (value > 0) return positive;
    return 0;
}

}  // namespace

bool DirectionalControl::openAuthenticatedChannel(std::uint32_t channel) {
    if (channel <= channel_) return false;
    release();
    channel_ = channel;
    lastLease_ = 0;
    lastSequence_ = 0;
    connected_ = true;
    return true;
}

void DirectionalControl::disconnect(std::uint32_t channel) {
    if (!connected_ || channel != channel_) return;
    connected_ = false;
    release();
}

bool DirectionalControl::poll(std::uint32_t now) {
    // The unsigned difference also works across millis() rollover.
    if (!activeLease_ || now - refreshed_ < ttlMs_) return false;
    release();
    return true;
}

bool DirectionalControl::validChannel(Frame frame) const {
    return connected_ && frame.channel == channel_ && frame.lease && frame.sequence;
}

bool DirectionalControl::current(Frame frame) const {
    return validChannel(frame) && frame.lease == activeLease_ && frame.sequence > lastSequence_;
}

void DirectionalControl::release() {
    activeLease_ = 0;
    mask_ = 0;
    latch_.write(0);
}

Result DirectionalControl::grant(Frame frame, std::uint32_t now, std::uint32_t ttlMs) {
    poll(now);
    if (!validChannel(frame) || activeLease_ || frame.lease <= lastLease_ ||
        frame.sequence <= lastSequence_ || !ttlMs || ttlMs > maxBenchTtlMs) {
        return Result::Rejected;
    }
    activeLease_ = lastLease_ = frame.lease;
    lastSequence_ = frame.sequence;
    refreshed_ = now;
    ttlMs_ = ttlMs;
    return Result::Granted;
}

Result DirectionalControl::direction(Frame frame, std::uint32_t now, int longitudinal, int lateral) {
    poll(now);
    if (!longitudinal && !lateral) return stop(frame, now);
    if (!current(frame)) return Result::Rejected;
    lastSequence_ = frame.sequence;
    if (!validAxis(longitudinal) || !validAxis(lateral)) {
        release();
        return Result::Rejected;
    }
    const std::uint8_t next = axisMask(longitudinal, reverse, forward) |
                              axisMask(lateral, left, right);
    if (next != mask_) {
        mask_ = next;
        latch_.write(mask_);
    }
    return Result::Applied;
}

Result DirectionalControl::renew(Frame frame, std::uint32_t now) {
    poll(now);
    if (!current(frame)) return Result::Rejected;
    lastSequence_ = frame.sequence;
    refreshed_ = now;
    return Result::Renewed;
}

Result DirectionalControl::stop(Frame frame, std::uint32_t now) {
    poll(now);
    if (!validChannel(frame) || (frame.lease != activeLease_ && frame.lease <= lastLease_)) {
        return Result::Rejected;
    }
    // STOP may arrive ahead of a grant or behind a higher-sequence direction.
    // Retiring the lease, rather than merely ordering STOP, prevents rearming.
    lastLease_ = frame.lease;
    if (frame.sequence > lastSequence_) lastSequence_ = frame.sequence;
    release();
    return Result::Released;
}

}  // namespace node01
