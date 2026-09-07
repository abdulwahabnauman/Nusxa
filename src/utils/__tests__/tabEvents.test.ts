import { notifyTabPressed, onTabPressed } from '../tabEvents';

describe('tab press events', () => {
  it('delivers presses only to the subscribed tab', () => {
    const home = jest.fn();
    const medicines = jest.fn();
    const offHome = onTabPressed('index', home);
    const offMedicines = onTabPressed('medicines', medicines);

    notifyTabPressed('index');
    expect(home).toHaveBeenCalledTimes(1);
    expect(medicines).not.toHaveBeenCalled();

    notifyTabPressed('medicines');
    expect(home).toHaveBeenCalledTimes(1);
    expect(medicines).toHaveBeenCalledTimes(1);

    offHome();
    offMedicines();
    notifyTabPressed('index');
    expect(home).toHaveBeenCalledTimes(1);
  });
});
