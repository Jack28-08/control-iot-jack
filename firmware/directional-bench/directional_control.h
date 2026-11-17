#ifndef NODE01_DIRECTIONAL_CONTROL_H
#define NODE01_DIRECTIONAL_CONTROL_H

#include <cstdint>

namespace node01 {

class Latch {
public:
    virtual ~Latch() = default;
    virtual void write(std::uint8_t mask) = 0;
};

struct Frame {
    std::uint32_t channel;
    std::uint64_t lease;
    std::uint64_t sequence;
};

enum class Result { Rejected, Granted, Renewed, Applied, Released };

// All calls are serialized by the caller. Timestamps are the device's millis().
class DirectionalControl {
public:
    explicit DirectionalControl(Latch& latch) : latch_(latch) {}
    DirectionalControl(const DirectionalControl&) = delete;
    DirectionalControl& operator=(const DirectionalControl&) = delete;

    // Call after preparing the inactive outputs. Only the authenticated
    // transport can open a channel and assign its local generation.
    bool openAuthenticatedChannel(std::uint32_t channel);
    void disconnect(std::uint32_t channel);

    // Neutralize on expiry. Call even when no frames arrive.
    bool poll(std::uint32_t now);

    Result grant(Frame frame, std::uint32_t now, std::uint32_t ttlMs);
    Result direction(Frame frame, std::uint32_t now, int longitudinal, int lateral);
    Result renew(Frame frame, std::uint32_t now);
    Result stop(Frame frame, std::uint32_t now);

private:
    bool validChannel(Frame frame) const;
    bool current(Frame frame) const;
    void release();

    Latch& latch_;
    std::uint32_t channel_ = 0;
    std::uint64_t activeLease_ = 0;
    std::uint64_t lastLease_ = 0;
    std::uint64_t lastSequence_ = 0;
    std::uint32_t refreshed_ = 0;
    std::uint32_t ttlMs_ = 0;
    std::uint8_t mask_ = 0;
    bool connected_ = false;
};

}  // namespace node01

#endif
