//newmethod
package de.fhg.iais.roberta.syntax.action.nao;

import de.fhg.iais.roberta.syntax.action.Action;
import de.fhg.iais.roberta.syntax.lang.expr.Expr;
import de.fhg.iais.roberta.transformer.forClass.NepoPhrase;
import de.fhg.iais.roberta.transformer.forField.NepoValue;
import de.fhg.iais.roberta.typecheck.BlocklyType;
import de.fhg.iais.roberta.util.ast.BlocklyProperties;

@NepoPhrase(name = "MOVE_TO_POS", category = "ACTOR", blocklyNames = {"naoActions_moveToPosition"})//{"naoTesting_move"})
public final class MoveToPos extends Action {
    @NepoValue(name = "X", type = BlocklyType.NUMBER_INT)
    public final Expr x;

    @NepoValue(name = "Y", type = BlocklyType.NUMBER_INT)
    public final Expr y;

    @NepoValue(name = "Z", type = BlocklyType.NUMBER_INT)
    public final Expr z;

    @NepoValue(name = "DURATION", type = BlocklyType.NUMBER_INT)
    public final Expr duration;

    public MoveToPos(BlocklyProperties properties, Expr x, Expr y, Expr z, Expr duration) {
        super(properties);
        this.x = x;
        this.y = y;
        this.z = z;
        this.duration = duration;
        setReadOnly();
    }
}