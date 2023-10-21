import { expect } from "chai";
import GuestbookRepository from "@src/domains/guestbook/guestbook.repository";
import UserRepository from "@src/domains/user/user.repository";
import GuestbookStub from "@stub/guestbook.stub";
import UserStub from "@stub/user.stub";
import mockInstance from "@test/utils/mockInstance";

describe("Guestbook Repository Test", () => {
  const guestbookRepository = mockInstance(GuestbookRepository);
  const userRepository = mockInstance(UserRepository);

  it("Guestbook should be deleted when User deleted (onDelete CASCADE) [not soft delete]", async () => {
    const userStub = new UserStub();
    const newUser = await userRepository.save(userStub);
    const guestbookStub = new GuestbookStub({ user: newUser });
    const newGuestbook = await guestbookRepository.save(guestbookStub);

    await userRepository.delete(newUser.id);
    const foundGuestbook = await guestbookRepository.findOneBy({
      id: newGuestbook.id,
    });
    const foundUser = await userRepository.findOneBy({
      id: newUser.id,
    });

    expect(newGuestbook.user.id).to.be.equal(newUser.id);
    expect(foundGuestbook).to.be.null;
    expect(foundUser).to.be.null;
  });
});
