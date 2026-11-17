#include "directional_control.h"

#include <cassert>
#include <cstddef>
#include <limits>
#include <vector>

using node01::DirectionalControl;
using node01::Frame;
using node01::Latch;
using node01::Result;

class FakeLatch final : public Latch {
public:
    void write(std::uint8_t mask) override { writes.push_back(mask); }
    std::vector<std::uint8_t> writes;
};

void eachDirectionUsesOneLatch() {
    FakeLatch latch;
    DirectionalControl controller(latch);
    assert(controller.openAuthenticatedChannel(1));
    assert(controller.grant({1, 1, 1}, 100, 500) == Result::Granted);
    assert(latch.writes == std::vector<std::uint8_t>{0});

    const struct { int longitudinal; int lateral; std::uint8_t mask; } directions[] = {
        { 1,  0, 0x02}, { 1,  1, 0x82}, {0,  1, 0x80}, {-1,  1, 0x90},
        {-1,  0, 0x10}, {-1, -1, 0x11}, {0, -1, 0x01}, { 1, -1, 0x03},
    };
    std::uint64_t sequence = 2;
    for (const auto& d : directions) {
        const auto writes = latch.writes.size();
        assert(controller.direction({1, 1, sequence++}, 101, d.longitudinal, d.lateral) == Result::Applied);
        assert(latch.writes.size() == writes + 1 && latch.writes.back() == d.mask);
    }
    // Release the lateral axis while leaving forward held.
    assert(controller.direction({1, 1, sequence++}, 102, 1, 0) == Result::Applied);
    assert(latch.writes.back() == 0x02);
    const auto writes = latch.writes.size();
    assert(controller.direction({1, 1, sequence++}, 103, 1, 0) == Result::Applied);
    assert(latch.writes.size() == writes);
    assert(controller.direction({1, 1, sequence}, 104, 0, 0) == Result::Released);
    assert(latch.writes.back() == 0);
}

void rejectsStaleFramesAndStopsAheadOfPendingWork() {
    FakeLatch latch;
    DirectionalControl controller(latch);
    assert(controller.openAuthenticatedChannel(1));
    assert(controller.grant({1, 7, 1}, 10, 100) == Result::Granted);
    assert(controller.direction({1, 7, 4}, 11, 1, 1) == Result::Applied);
    assert(controller.direction({1, 7, 4}, 12, -1, -1) == Result::Rejected);
    assert(controller.direction({1, 7, 3}, 12, -1, -1) == Result::Rejected);
    assert(controller.direction({1, 8, 5}, 12, -1, -1) == Result::Rejected);
    assert(latch.writes.size() == 2 && latch.writes.back() == 0x82);

    // An older STOP still releases this lease. A delayed higher-sequence move cannot re-arm it.
    assert(controller.stop({1, 7, 2}, 12) == Result::Released);
    assert(controller.direction({1, 7, 15}, 13, 1, -1) == Result::Rejected);
    assert(controller.grant({1, 7, 16}, 14, 100) == Result::Rejected);
    assert(controller.stop({1, 8, 17}, 14) == Result::Released);
    assert(controller.grant({1, 8, 18}, 15, 100) == Result::Rejected);
    assert(latch.writes.back() == 0);

    assert(controller.grant({1, 9, 19}, 16, 100) == Result::Granted);
    assert(controller.direction({1, 9, 20}, 17, -1, 1) == Result::Applied);
    assert(controller.stop({1, 8, 21}, 18) == Result::Rejected);
    assert(latch.writes.back() == 0x90);
}

void expiresUnlessExplicitlyRenewed() {
    FakeLatch latch;
    DirectionalControl controller(latch);
    assert(controller.openAuthenticatedChannel(1));
    assert(controller.grant({1, 1, 1}, 100, 0) == Result::Rejected);
    assert(controller.grant({1, 1, 1}, 100, 1001) == Result::Rejected);
    assert(controller.grant({1, 1, 1}, 100, 50) == Result::Granted);
    assert(controller.direction({1, 1, 2}, 101, 1, -1) == Result::Applied);
    assert(controller.renew({1, 1, 3}, 140) == Result::Renewed);
    assert(!controller.poll(150));
    assert(controller.direction({1, 1, 4}, 189, 1, 1) == Result::Applied);
    assert(!controller.poll(189) && latch.writes.back() == 0x82);
    // Sending another direction did not renew the deadline.
    assert(controller.poll(190) && latch.writes.back() == 0);
    assert(controller.renew({1, 1, 5}, 191) == Result::Rejected);
    assert(controller.direction({1, 1, 6}, 192, 1, 0) == Result::Rejected);
    assert(!controller.poll(200));
}

void expiresAcrossMillisRolloverBeforeHandlingAQueuedFrame() {
    FakeLatch latch;
    DirectionalControl controller(latch);
    assert(controller.openAuthenticatedChannel(1));
    const auto almostWrapped = std::numeric_limits<std::uint32_t>::max() - 30;
    assert(controller.grant({1, 2, 1}, almostWrapped, 40) == Result::Granted);
    assert(controller.direction({1, 2, 2}, almostWrapped + 1, -1, 0) == Result::Applied);
    assert(!controller.poll(8));
    assert(controller.renew({1, 2, 3}, 9) == Result::Rejected);
    assert(latch.writes.back() == 0);
}

void disconnectAndReconnectRequireFreshGrant() {
    FakeLatch latch;
    DirectionalControl controller(latch);
    assert(controller.grant({1, 1, 1}, 0, 100) == Result::Rejected);
    assert(!controller.openAuthenticatedChannel(0));
    assert(controller.openAuthenticatedChannel(1));
    assert(controller.grant({1, 1, 1}, 100, 50) == Result::Granted);
    assert(controller.direction({1, 1, 2}, 101, 0, 1) == Result::Applied);
    assert(!controller.openAuthenticatedChannel(1));
    assert(latch.writes.back() == 0x80);
    controller.disconnect(1);
    assert(latch.writes.back() == 0);
    assert(controller.direction({1, 1, 3}, 102, 1, 1) == Result::Rejected);
    assert(!controller.openAuthenticatedChannel(1));
    assert(controller.openAuthenticatedChannel(2));
    assert(controller.direction({2, 1, 1}, 103, 0, 1) == Result::Rejected);
    assert(controller.grant({2, 1, 1}, 104, 50) == Result::Granted);
    assert(controller.direction({1, 1, 4}, 104, -1, 0) == Result::Rejected);
    assert(controller.direction({2, 1, 2}, 105, 0, 1) == Result::Applied);
    controller.disconnect(1);
    assert(latch.writes.back() == 0x80);
    assert(controller.openAuthenticatedChannel(3));
    assert(latch.writes.back() == 0);
}

void invalidCurrentAxisReleasesWithoutChangingAuxiliaryOutputs() {
    FakeLatch latch;
    DirectionalControl controller(latch);
    assert(controller.openAuthenticatedChannel(1));
    assert(controller.grant({1, 1, 1}, 100, 50) == Result::Granted);
    assert(controller.direction({1, 1, 2}, 101, -1, -1) == Result::Applied);
    assert(controller.direction({1, 1, 3}, 102, 2, -1) == Result::Rejected);
    assert((latch.writes == std::vector<std::uint8_t>{0, 0x11, 0}));
    assert(controller.direction({1, 1, 4}, 103, 1, -1) == Result::Rejected);
}

int main() {
    eachDirectionUsesOneLatch();
    rejectsStaleFramesAndStopsAheadOfPendingWork();
    expiresUnlessExplicitlyRenewed();
    expiresAcrossMillisRolloverBeforeHandlingAQueuedFrame();
    disconnectAndReconnectRequireFreshGrant();
    invalidCurrentAxisReleasesWithoutChangingAuxiliaryOutputs();
}
