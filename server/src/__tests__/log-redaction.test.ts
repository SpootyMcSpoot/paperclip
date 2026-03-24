import { describe, expect, it } from "vitest";
import {
  CURRENT_USER_REDACTION_TOKEN,
  redactCurrentUserText,
  redactCurrentUserValue,
} from "../log-redaction.js";

describe("log redaction", () => {
  it("redacts the active username inside home-directory paths", () => {
    const userName = "stapleuser";
    const input = [
      `cwd=/Users/${userName}/staple`,
      `home=/home/${userName}/workspace`,
      `win=C:\\Users\\${userName}\\staple`,
    ].join("\n");

    const result = redactCurrentUserText(input, {
      userNames: [userName],
      homeDirs: [`/Users/${userName}`, `/home/${userName}`, `C:\\Users\\${userName}`],
    });

    expect(result).toContain(`cwd=/Users/${CURRENT_USER_REDACTION_TOKEN}/staple`);
    expect(result).toContain(`home=/home/${CURRENT_USER_REDACTION_TOKEN}/workspace`);
    expect(result).toContain(`win=C:\\Users\\${CURRENT_USER_REDACTION_TOKEN}\\staple`);
    expect(result).not.toContain(userName);
  });

  it("redacts standalone username mentions without mangling larger tokens", () => {
    const userName = "stapleuser";
    const result = redactCurrentUserText(
      `user ${userName} said ${userName}/project should stay but astapleuserz should not change`,
      {
        userNames: [userName],
        homeDirs: [],
      },
    );

    expect(result).toBe(
      `user ${CURRENT_USER_REDACTION_TOKEN} said ${CURRENT_USER_REDACTION_TOKEN}/project should stay but astapleuserz should not change`,
    );
  });

  it("recursively redacts nested event payloads", () => {
    const userName = "stapleuser";
    const result = redactCurrentUserValue({
      cwd: `/Users/${userName}/staple`,
      prompt: `open /Users/${userName}/staple/ui`,
      nested: {
        author: userName,
      },
      values: [userName, `/home/${userName}/project`],
    }, {
      userNames: [userName],
      homeDirs: [`/Users/${userName}`, `/home/${userName}`],
    });

    expect(result).toEqual({
      cwd: `/Users/${CURRENT_USER_REDACTION_TOKEN}/staple`,
      prompt: `open /Users/${CURRENT_USER_REDACTION_TOKEN}/staple/ui`,
      nested: {
        author: CURRENT_USER_REDACTION_TOKEN,
      },
      values: [CURRENT_USER_REDACTION_TOKEN, `/home/${CURRENT_USER_REDACTION_TOKEN}/project`],
    });
  });
});
